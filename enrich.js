import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import { getStep, setStep } from './utils.js';

/**
 * Étape 3a : Enrichit les données avec l'API SIRENE.
 * @param {string} sourceName - Le nom de la source.
 */
async function enrichWithSirene(sourceName) {
    console.log("\n--- DÉBUT ÉTAPE 3a: Enrichissement via API SIRENE ---");
    const detailsData = getStep(sourceName, "details");
    const sireneData = getStep(sourceName, "sirene");

    const doneNames = new Set(sireneData.map(item => item.nom));
    console.log(`-> Reprise de l'enrichissement SIRENE. ${doneNames.size}/${detailsData.length} entreprises déjà traitées.`);

    for (const company of detailsData) {
        if (doneNames.has(company.nom)) {
            continue;
        }

        try {
            if (!company.codePostal) {
                console.log(`[${sireneData.length}/${detailsData.length}] 🟡 ${company.nom} - Ignorée (pas de code postal)`);
                continue;
            }

            const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(company.nom)}&code_postal=${company.codePostal}&per_page=1`);
            const apiResult = await response.json();

            let enrichedData = { ...company, sirene_found: false };
            if (apiResult.results && apiResult.results.length > 0) {
                const sireneInfo = apiResult.results[0];
                enrichedData = {
                    ...company,
                    sirene_found: true,
                    siren: sireneInfo.siren,
                    sirene_nom_complet: sireneInfo.nom_complet,
                    sirene_adresse: sireneInfo.siege.adresse,
                };
            }

            sireneData.push(enrichedData);
            setStep(sourceName, "sirene", sireneData);
            const status = enrichedData.sirene_found ? '✅' : '🟡';
            console.log(`[${sireneData.length}/${detailsData.length}] ${status} ${company.nom}`);

        } catch (error) {
            console.log(`[${sireneData.length}/${detailsData.length}] ❌ ${company.nom} - Erreur API: ${error.message}`);
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
    const sireneData = getStep(sourceName, "sirene");
    const finalData = getStep(sourceName, "final");

    const doneNames = new Set(finalData.map(item => item.nom));
    console.log(`-> Reprise de la recherche LinkedIn. ${doneNames.size}/${sireneData.length} entreprises déjà traitées.`);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        for (const company of sireneData) {
            if (doneNames.has(company.nom)) {
                continue;
            }

            let linkedinUrl = '';
            try {
                if (company.website) {
                    await page.goto(company.website, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    const linkedinHandle = await page.waitForSelector('a[href*="linkedin.com/company/"]', { timeout: 3000 }).catch(() => null);
                    if(linkedinHandle) {
                        linkedinUrl = await page.evaluate(a => a.href, linkedinHandle);
                    }
                }

                const finalCompany = { ...company, linkedinUrl };
                finalData.push(finalCompany);
                setStep(sourceName, "final", finalData);
                const status = linkedinUrl ? '✅' : '🟡';
                console.log(`[${finalData.length}/${sireneData.length}] ${status} ${company.nom}`);

            } catch (error) {
                console.log(`[${finalData.length}/${sireneData.length}] ❌ ${company.nom} - Erreur Puppeteer: ${error.message}`);
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