import { getStep, setStep, logError } from './utils.js';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

/**
 * Étape 1 : Récupère la liste des URLs à scraper.
 * Ne s'exécute que si la liste n'a pas déjà été sauvegardée.
 * @param {string} sourceName - Le nom de la source (ex: 'frenchFab').
 * @param {object} scraper - Le module scraper importé, doit contenir getList().
 * @param {boolean} isTestMode - Indique si on est en mode test.
 */
async function runGetListStep(sourceName, scraper, isTestMode = false) {
    console.log("--- DÉBUT ÉTAPE 1: Récupération de la liste d'URLs ---");
    const existingUrls = await getStep(sourceName, "urls", isTestMode);

    if (existingUrls.length > 0) {
        console.log(`✅ Étape 1 déjà complétée. ${existingUrls.length} URLs trouvées.`);
        return;
    }

    console.log(`-> Lancement de la collecte des URLs pour ${sourceName}...`);
    const newList = await scraper.getList(isTestMode);
    await setStep(sourceName, "urls", newList, isTestMode);
    console.log(`✅ Étape 1 terminée. ${newList.length} URLs sauvegardées.`);
}

/**
 * Étape 2 : Scrape les détails de chaque URL.
 * Reprend le travail là où il s'est arrêté.
 * @param {string} sourceName - Le nom de la source (ex: 'frenchFab').
 * @param {object} scraper - Le module scraper importé, doit contenir getDetails().
 * @param {boolean} isTestMode - Indique si on est en mode test.
 */
async function runGetDetailsStep(sourceName, scraper, isTestMode = false) {
    console.log("\n--- DÉBUT ÉTAPE 2: Scraping des pages de détail ---");
    const urlsToScrape = await getStep(sourceName, "urls", isTestMode);
    const detailsAlreadyDone = await getStep(sourceName, "details", isTestMode);

    // On utilise un Set pour une vérification ultra-rapide de ce qui a déjà été fait.
    const doneLinks = new Set(detailsAlreadyDone.map(item => item.lien));

    console.log(`-> Reprise du scraping. ${doneLinks.size}/${urlsToScrape.length} entreprises déjà traitées.`);

    const progressBar = new cliProgress.SingleBar({
        format: '{bar} {percentage}% | {value}/{total} | {payload}'
    }, cliProgress.Presets.shades_classic);

    progressBar.start(urlsToScrape.length, doneLinks.size);
    progressBar.update({ payload: "Démarrage..." });

    for (const item of urlsToScrape) {
        if (doneLinks.has(item.lien)) {
            continue;
        }

        try {
            progressBar.update({ payload: `Scraping de ${chalk.cyan(item.nom)}` });
            const detailedData = await scraper.getDetails(item.lien);

            // On fusionne les données initiales (nom, lien) avec les détails
            const completeData = {
                nom: item.nom,
                lien: item.lien,
                ...detailedData
            };

            detailsAlreadyDone.push(completeData);
            await setStep(sourceName, "details", detailsAlreadyDone, isTestMode); // Sauvegarde à chaque succès

            progressBar.increment();

        } catch (error) {
            progressBar.update({ payload: chalk.red(`ERREUR sur ${item.nom}`) });
            await logError(sourceName, 'details', error, { nom: item.nom, lien: item.lien }, isTestMode);
            progressBar.increment();
        }
    }
    progressBar.stop();
    console.log("✅ Étape 2 terminée. Toutes les pages de détail ont été traitées.");
}

// On exporte les fonctions du pipeline pour les utiliser dans main.js
export default { runGetListStep, runGetDetailsStep };