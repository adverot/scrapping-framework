import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import fs from 'fs';
import { getStep, setStep, delay } from './utils.js';
import constants from './constants.js';

/**
 * Étape 3a : Enrichit les données avec l'API SIRENE.
 * @param {string} sourceName - Le nom de la source.
 */
async function enrichWithSirene(sourceName) {
    let logsPath = `./data/${sourceName}-logs.txt`;
    console.log(chalk.blue("\n--- DÉBUT ÉTAPE 3a: Enrichissement via API SIRENE ---"));

    const companiesToEnrich = getStep(sourceName, "details");
    const enrichedCompanies = getStep(sourceName, "enriched");

    const doneNames = new Set(enrichedCompanies.map(item => item.nom));
    let successCount = enrichedCompanies.length;

    const progressBar = new cliProgress.SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | {payload}' },
        cliProgress.Presets.shades_classic);
    progressBar.start(companiesToEnrich.length, doneNames.size);

    let companyIdCounter = enrichedCompanies.length;
    let dirigeantsIdCounter = enrichedCompanies.reduce((acc, company) => acc + (company.dirigeants?.length || 0), 0);
    ;

    for (const company of companiesToEnrich) {
        if (doneNames.has(company.nom)) {
            continue;
        }

        try {
            if (!company.codePostal) {
                const payloadString = `Trouvées: ${chalk.green(successCount)} | ${chalk.yellow(`${company.nom} - Ignorée (pas de CP)`)}`;
                progressBar.increment(1, { payload: payloadString });
                continue;
            }

            const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(company.nom)}&etat_administratif=A&code_postal=${company.codePostal}&ca_min=10000000&ca_max=300000000`, {
                method: 'GET',
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const rawData = await response.json();
            const data = rawData.results.filter(d => d.nom_complet.includes(company.nom) || d.nom_raison_sociale.includes(company.nom));

            if (!data || data.length === 0) {
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.yellow(`${company.nom} - Aucune entreprise trouvée`)}`;
                progressBar.increment(1, { payload: payloadString });
                continue;
            }

            for (let d of data) {
                const uniqueID = "ENT-" + String(++companyIdCounter).padStart(5, '0');
                const [departement, region] = await Promise.all([
                    fetch(`https://geo.api.gouv.fr/departements/${d.siege.departement}`).then(d => d.json()).catch(() => ({ code: "", nom: "" })),
                    fetch(`https://geo.api.gouv.fr/regions/${d.siege.region}`).then(r => r.json()).catch(() => ({ nom: "" }))
                ]);
                const finalCompany = {};
                finalCompany.id = uniqueID;
                for (const [key, value] of Object.entries(company)) {
                    let finalValue = value;
                    if (key === 'website') {
                        finalValue = (new URL(value.includes('://') ? value : `https://${value}`)).origin + '/';
                    }
                    finalCompany[`scrap_${key}`] = finalValue;
                }

                const latestYear = d.finances ? Math.max(...Object.keys(d.finances).map(Number)) : null;

                finalCompany.sirene_siren = d.siren;
                finalCompany.sirene_adresse = d.siege.adresse;
                finalCompany.sirene_ville = d.siege.libelle_commune;
                finalCompany.siren_departement_code = departement.code;
                finalCompany.sirene_departement = departement.nom;
                finalCompany.sirene_region = region.nom;
                finalCompany.sirene_activite = constants.DIVISION_ACTIVITE_PRINCIPALE[d.activite_principale?.split('.')[0]] ?? "";
                finalCompany.sirene_ca = latestYear ? d.finances[latestYear]?.ca ?? "" : "";
                finalCompany.sirene_annee_ca = latestYear ?? "";
                finalCompany.sirene_effectifs = constants.TRANCHES_EFFECTIFS[d.tranche_effectif_salarie] ?? "";
                finalCompany.sirene_annee_effectifs = d.annee_tranche_effectif_salarie ?? "";
                finalCompany.domain = finalCompany.scrap_website?.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] ?? null;
                if (!finalCompany.scrap_website || !finalCompany.scrap_nom || !finalCompany.scrap_codePostal) continue;
                finalCompany.dirigeants = (d.dirigeants ?? [])
                    .filter(d => d.type_dirigeant === 'personne physique')
                    .filter(d => !constants.ROLES_A_EXCLURE.includes(d.qualite))
                    .map(d => ({
                        id: "PER-" + String(++dirigeantsIdCounter).padStart(5, '0'),
                        prenom: d.prenoms,
                        nom: d.nom,
                        fonction: d.qualite ?? '',
                        entreprise: company.nom,
                        idEntreprise: uniqueID
                    }))
                enrichedCompanies.push(finalCompany);
            }

            setStep(sourceName, "enriched", enrichedCompanies);
            successCount++;
            const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.green(company.nom)}`;
            progressBar.increment(1, { payload: payloadString });
        } catch (error) {
            fs.writeFileSync(logsPath, `\n${enrichedCompanies.length}/${companiesToEnrich.length}] ❌ ${company.nom} - Erreur API: ${error.message}`, { encoding: 'utf-8', flag: 'a' });
            const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.red(`${company.nom} - Erreur SIRENE`)}`;
            progressBar.increment(1, { payload: payloadString });
        } finally {
            await delay(250);
        }
    }
    console.log("✅ Étape 3a terminée. L'enrichissement SIRENE est complet.");
}

/**
 * Étape 3b : Enrichit les données avec les URLs LinkedIn via Puppeteer.
 * @param {string} sourceName - Le nom de la source.
 */
async function enrichWithLinkedIn(sourceName) {
    console.log("\n--- DÉBUT ÉTAPE 3b: Recherche des URLs LinkedIn ---");
    const enrichedData = getStep(sourceName, "enriched");
    const finalData = getStep(sourceName, "final");
    let successCount = finalData.length;

    const doneNames = new Set(finalData.map(item => item.scrap_nom));
    const progressBar = new cliProgress.SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | {payload}' },
        cliProgress.Presets.shades_classic);
    progressBar.start(enrichedData.length, doneNames.size);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    });

    try {
        for (const company of enrichedData) {
            if (doneNames.has(company.scrap_nom)) {
                continue;
            }

            let linkedinUrl = '';
            try {
                if (company.website) {
                    await page.goto(company.website, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    const linkedinHandle = await page.waitForSelector('a[href*="linkedin.com/company/"]', { timeout: 5000 }).catch(() => null);
                    if (linkedinHandle) {
                        linkedinUrl = await page.evaluate(a => a.href, linkedinHandle);
                        successCount++;
                    }
                }

                const finalCompany = { ...company, linkedinUrl };
                finalData.push(finalCompany);
                setStep(sourceName, "final", finalData);
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.blue(`${company.nom}`)}`;
                progressBar.increment(1, { payload: payloadString });
            } catch (error) {
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.red(`${company.nom} - LinkedIn Erreur`)}`;
                progressBar.increment(1, { payload: payloadString });
                // On sauvegarde quand même l'échec pour ne pas réessayer
                const finalCompany = { ...company, linkedinUrl: 'ERREUR' };
                finalData.push(finalCompany);
                setStep(sourceName, "final", finalData);
            }
        }
    } finally {
        await browser.close();
    }
    console.log("✅ Étape 3b terminée. La recherche LinkedIn est complète.");
}


export default { enrichWithSirene, enrichWithLinkedIn };