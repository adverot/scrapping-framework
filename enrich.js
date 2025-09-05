import fetch from 'node-fetch';
import puppeteer, { TimeoutError } from 'puppeteer';
import path from 'path';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { getStep, setStep, delay, logError } from './utils.js';
import constants from './constants.js';

/**
 * Étape 3a : Enrichit les données avec l'API SIRENE.
 * @param {string} sourceName - Le nom de la source.
 * @param {boolean} isTestMode - Indique si on est en mode test.
 */
async function enrichWithSirene(sourceName, isTestMode = false) {
    console.log(chalk.blue("\n--- DÉBUT ÉTAPE 3a: Enrichissement via API SIRENE ---"));

    const companiesToEnrich = await getStep(sourceName, "details", isTestMode);
    let enrichedCompanies = await getStep(sourceName, "enriched", isTestMode);

    const doneNames = new Set(enrichedCompanies.map(item => item.scrap_nom));
    let successCount = enrichedCompanies.filter(c => c.sirene_siren).length;

    const progressBar = new cliProgress.SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | {payload}' },
        cliProgress.Presets.shades_classic);
    progressBar.start(companiesToEnrich.length, doneNames.size);

    let companyIdCounter = enrichedCompanies.length;
    let dirigeantsIdCounter = enrichedCompanies.reduce((acc, company) => acc + (company.dirigeants?.length || 0), 0);

    for (const company of companiesToEnrich) {
        if (doneNames.has(company.nom)) {
            continue;
        }

        let foundOneResult = false;

        try {
            if (!company.codePostal) {
                // On ne fait rien, le placeholder sera ajouté dans le `finally`
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
                foundOneResult = true;
            }

            if (foundOneResult) {
                successCount++;
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.green(company.nom)}`;
                progressBar.increment(1, { payload: payloadString });
            } else {
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.yellow(`${company.nom} - Aucune entreprise trouvée`)}`;
                progressBar.increment(1, { payload: payloadString });
            }

        } catch (error) {
            await logError(sourceName, 'enrich:sirene', error, { nom: company.nom }, isTestMode);
            const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.red(`${company.nom} - Erreur SIRENE`)}`;
            progressBar.increment(1, { payload: payloadString });
        } finally {
            // Si l'entreprise n'a pas été ajoutée (pas de résultat ou erreur),
            // on ajoute un placeholder pour la marquer comme "traitée".
            if (!foundOneResult) {
                const placeholder = {};
                // On copie les données de scraping
                for (const [key, value] of Object.entries(company)) {
                    placeholder[`scrap_${key}`] = value;
                }
                placeholder.sirene_siren = null;
                placeholder.dirigeants = [];
                enrichedCompanies.push(placeholder);
            }
            // On sauvegarde l'état à chaque itération pour une reprise fiable.
            await setStep(sourceName, "enriched", enrichedCompanies, isTestMode);
            await delay(250);
        }
    }
    progressBar.stop();
    console.log("\n✅ Étape 3a terminée. L'enrichissement SIRENE est complet.");
}

/**
 * Étape 3b : Enrichit les données avec les URLs LinkedIn via Puppeteer.
 * @param {string} sourceName - Le nom de la source.
 * @param {boolean} isTestMode - Indique si on est en mode test.
 */
async function enrichWithLinkedIn(sourceName, isTestMode = false) {
    console.log("\n--- DÉBUT ÉTAPE 3b: Recherche des URLs LinkedIn ---");
    const allProcessedCompanies = await getStep(sourceName, "enriched", isTestMode);
    // On ne traite que les entreprises qui ont été réellement enrichies par SIRENE.
    const companiesToEnrich = allProcessedCompanies.filter(c => c.sirene_siren);

    let finalData = await getStep(sourceName, "final", isTestMode);
    let successCount = finalData.length;

    const doneNames = new Set(finalData.map(item => item.scrap_nom));
    const progressBar = new cliProgress.SingleBar(
        { format: '{bar} {percentage}% | {value}/{total} | {payload}' },
        cliProgress.Presets.shades_classic);
    progressBar.start(companiesToEnrich.length, doneNames.size);

    let browser;

    try {
        // On force Puppeteer à utiliser un dossier de cache stable pour éviter les problèmes de pare-feu
        // à chaque mise à jour.
        const puppeteerCacheDir = path.join(process.cwd(), '.puppeteer_cache');

        browser = await puppeteer.launch({
            cacheDirectory: puppeteerCacheDir,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        for (const company of companiesToEnrich) {
            if (doneNames.has(company.scrap_nom)) {
                continue;
            }

            let selectedUrl = '';
            let finalCompany = { ...company, linkedinUrl: '' }; // Initialiser avec une URL vide

            try {
                let navigationSuccess = false;
                if (company.scrap_website && company.scrap_website.startsWith('http')) {
                    try {
                        // Tentative 1
                        await page.goto(company.scrap_website, { waitUntil: 'networkidle2', timeout: 5000 });
                        navigationSuccess = true;
                    } catch (error1) {
                        await logError(sourceName, 'enrich:linkedin_nav_attempt1', error1, { nom: company.scrap_nom, website: company.scrap_website }, isTestMode);
                        progressBar.update({ payload: chalk.yellow(`Erreur nav sur ${company.scrap_nom}, 2nde tentative...`) });
                        try {
                            // Tentative 2
                            await page.goto(company.scrap_website, { waitUntil: 'networkidle2', timeout: 10000 });
                            navigationSuccess = true;
                        } catch (error2) {
                            await logError(sourceName, 'enrich:linkedin_nav_attempt2', error2, { nom: company.scrap_nom, website: company.scrap_website }, isTestMode);
                            // Si l'erreur finale n'est pas un simple timeout, on la considère comme une erreur "dure".
                            if (!(error2 instanceof TimeoutError)) {
                                finalCompany.linkedinUrl = 'ERREUR';
                            }
                        }
                    }

                    // Si la navigation a réussi, on cherche les liens
                    if (navigationSuccess) {
                        // 2. Récupérer TOUS les liens linkedin sur le site
                        const allLinkedinLinks = await page.$$eval('a[href*="linkedin.com"]', links =>
                            links.map(link => link.href)
                        );

                        // 3. Appliquer la stratégie de priorisation
                        const companyMatches = allLinkedinLinks.filter(href => href.includes('/company/'));
                        const otherMatches = allLinkedinLinks.filter(href => !href.includes('/company/'));

                        if (companyMatches.length > 0) {
                            selectedUrl = companyMatches[0]; // Priorité aux liens "company"
                        } else if (otherMatches.length > 0) {
                            selectedUrl = otherMatches[0];
                        }

                        // Si rien n'est trouvé sur le site, on lance une recherche Google
                        if (!selectedUrl) {
                            progressBar.update({ payload: chalk.cyan(`Recherche DDG pour ${company.scrap_nom}...`) });
                            const ddgQuery = encodeURIComponent(`${company.scrap_nom} linkedin`);
                            // Correction de l'URL pour utiliser le sous-domaine html.
                            const ddgSearchUrl = `https://html.duckduckgo.com/html/?q=${ddgQuery}`;

                            await page.goto(ddgSearchUrl, { waitUntil: 'networkidle2', timeout: 10000 });

                            // Récupère tous les liens pertinents de la page de résultats DuckDuckGo
                            const ddgLinks = await page.evaluate(() => {
                                // Les résultats sont dans des div avec la classe 'result'
                                const links = Array.from(document.querySelectorAll('.results .result__a[href*="linkedin.com"]'));
                                return links.map(a => a.href);
                            });

                            // DuckDuckGo HTML version uses redirect links. We need to parse them.
                            const cleanedLinks = ddgLinks.map(link => {
                                try {
                                    // The href can be a relative URL (starts with //), so we need a base.
                                    const fullUrl = new URL(link, 'https://duckduckgo.com');
                                    // The real URL is in the 'uddg' parameter
                                    const uddgParam = fullUrl.searchParams.get('uddg');
                                    return uddgParam || null; // Return the real URL or null if not found
                                } catch (e) {
                                    return null; // Ignore invalid URLs
                                }
                            }).filter(Boolean); // Remove nulls

                            // Applique la stratégie de priorisation
                            const companyMatches = cleanedLinks.filter(href => href.includes('/company/'));
                            const showcaseMatches = cleanedLinks.filter(href => href.includes('/showcase/'));

                            if (companyMatches.length > 0) {
                                selectedUrl = companyMatches[0]; // Priorité 1: Page "company"
                            } else if (showcaseMatches.length > 0) {
                                selectedUrl = showcaseMatches[0]; // Priorité 2: Page "showcase"
                            }
                        }
                    }
                }

                // 4. Mettre à jour l'objet et sauvegarder, même si non trouvé
                // On assigne l'URL trouvée seulement si on n'a pas déjà marqué une erreur "dure"
                if (finalCompany.linkedinUrl !== 'ERREUR') {
                    finalCompany.linkedinUrl = selectedUrl;
                }
                finalData.push(finalCompany);
                await setStep(sourceName, "final", finalData, isTestMode);

                if (selectedUrl) {
                    successCount++;
                }

                const statusMessage = finalCompany.linkedinUrl && finalCompany.linkedinUrl !== 'ERREUR'
                    ? chalk.blue(`${company.scrap_nom} (Trouvé)`)
                    : chalk.gray(`${company.scrap_nom} - Non trouvé`);
                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${statusMessage}`;
                progressBar.increment(1, { payload: payloadString });

            } catch (error) {
                await logError(sourceName, 'enrich:linkedin', error, { nom: company.scrap_nom, website: company.scrap_website }, isTestMode);

                // 5. Sauvegarder l'échec pour ne pas réessayer
                finalCompany.linkedinUrl = 'ERREUR';
                finalData.push(finalCompany);
                await setStep(sourceName, "final", finalData, isTestMode);

                const payloadString = `${chalk.green(`Trouvées: ${successCount}`)} | ${chalk.red(`${company.scrap_nom} - Erreur`)}`;
                progressBar.increment(1, { payload: payloadString });
            }
        }
    } finally {
        progressBar.stop();
        if (browser) {
            await browser.close();
        }
    }
    console.log("\n✅ Étape 3b terminée. La recherche LinkedIn est complète.");
}


export default { enrichWithSirene, enrichWithLinkedIn };