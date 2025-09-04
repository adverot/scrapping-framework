// Fichier: main.js

import pipeline from './pipeline.js';
import enrich from './enrich.js';

/**
 * Fonction principale qui orchestre l'ensemble du pipeline de scraping.
 */
async function main() {
    // 1. Récupérer le nom de la source depuis les arguments de la ligne de commande
    const sourceName = process.argv[2];

    // 2. Vérifier si un nom de source a été fourni
    if (!sourceName) {
        console.error("❌ Erreur : Vous devez spécifier un nom de source.");
        console.log("Exemple : node main.js frenchFab");
        process.exit(1); // Arrête le script avec un code d'erreur
    }

    console.log(`\n\n--- 🚀 DÉMARRAGE DU PIPELINE COMPLET POUR LA SOURCE : ${sourceName} ---\n`);

    try {
        // 3. Importer dynamiquement le module scraper correspondant
        const scraperPath = `./scrapers/${sourceName}.js`;
        const scraperModule = await import(scraperPath);
        const scraper = scraperModule.default; // On récupère l'objet exporté par "export default"

        // 4. Lancer le pipeline avec la configuration dynamique
        // Étape 1 : Récupère la liste des URLs
        await pipeline.runGetListStep(sourceName, scraper);

        // Étape 2 : Scrape les détails de chaque page
        await pipeline.runGetDetailsStep(sourceName, scraper);

        // Étape 3a : Enrichit avec l'API SIRENE
        await enrich.enrichWithSirene(sourceName);

        // Étape 3b : Enrichit avec les URLs LinkedIn
        await enrich.enrichWithLinkedIn(sourceName);

        console.log(`\n\n--- ✅ PIPELINE TERMINÉ AVEC SUCCÈS POUR LA SOURCE : ${sourceName} ---\n`);

    } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
            console.error(`\n\n--- ❌ ERREUR CRITIQUE ---`);
            console.error(`Le scraper pour la source "${sourceName}" n'a pas été trouvé.`);
            console.error(`Veuillez vérifier qu'un fichier nommé "${sourceName}.js" existe bien dans le dossier "/scrapers".`);
        } else {
            console.error("\n\n--- ❌ UNE ERREUR CRITIQUE A ARRÊTÉ LE PIPELINE ---");
            console.error(error);
        }
        process.exit(1);
    }
}

// Lancement du script
main();