// Fichier: pipeline.js

import { getStep, setStep } from './utils.js';

/**
 * Étape 1 : Récupère la liste des URLs à scraper.
 * Ne s'exécute que si la liste n'a pas déjà été sauvegardée.
 * @param {string} sourceName - Le nom de la source (ex: 'frenchFab').
 * @param {object} scraper - Le module scraper importé, doit contenir getList().
 */
async function runGetListStep(sourceName, scraper) {
    console.log("--- DÉBUT ÉTAPE 1: Récupération de la liste d'URLs ---");
    const existingUrls = getStep(sourceName, "urls");

    if (existingUrls.length > 0) {
        console.log(`✅ Étape 1 déjà complétée. ${existingUrls.length} URLs trouvées.`);
        return;
    }

    console.log(`-> Lancement de la collecte des URLs pour ${sourceName}...`);
    const newList = await scraper.getList();
    setStep(sourceName, "urls", newList);
    console.log(`✅ Étape 1 terminée. ${newList.length} URLs sauvegardées.`);
}

/**
 * Étape 2 : Scrape les détails de chaque URL.
 * Reprend le travail là où il s'est arrêté.
 * @param {string} sourceName - Le nom de la source (ex: 'frenchFab').
 * @param {object} scraper - Le module scraper importé, doit contenir getDetails().
 */
async function runGetDetailsStep(sourceName, scraper) {
    console.log("\n--- DÉBUT ÉTAPE 2: Scraping des pages de détail ---");
    const urlsToScrape = getStep(sourceName, "urls");
    const detailsAlreadyDone = getStep(sourceName, "details");

    // On utilise un Set pour une vérification ultra-rapide de ce qui a déjà été fait.
    const doneLinks = new Set(detailsAlreadyDone.map(item => item.lien));

    console.log(`-> Reprise du scraping. ${doneLinks.size}/${urlsToScrape.length} entreprises déjà traitées.`);

    for (const item of urlsToScrape) {
        if (doneLinks.has(item.lien)) {
            continue; // On passe directement au suivant, sans rien afficher
        }

        try {
            const detailedData = await scraper.getDetails(item.lien);

            // On fusionne les données initiales (nom, lien) avec les détails
            const completeData = {
                nom: item.nom,
                lien: item.lien,
                ...detailedData
            };

            detailsAlreadyDone.push(completeData);
            setStep(sourceName, "details", detailsAlreadyDone); // Sauvegarde à chaque succès

            console.log(`[${detailsAlreadyDone.length}/${urlsToScrape.length}] ✅ ${item.nom}`);

        } catch (error) {
            console.log(`[${detailsAlreadyDone.length}/${urlsToScrape.length}] ❌ ${item.nom} - Erreur: ${error.message}`);
        }
    }
    console.log("✅ Étape 2 terminée. Toutes les pages de détail ont été traitées.");
}

// On exporte les fonctions du pipeline pour les utiliser dans main.js
export default { runGetListStep, runGetDetailsStep };