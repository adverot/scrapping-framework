import fs from 'fs/promises';
import path from 'path';
import pipeline from './pipeline.js';
import enrich from './enrich.js';
import chalk from 'chalk';
import { convertToCsv } from './utils.js';

/**
 * Fonction principale qui orchestre l'ensemble du pipeline de scraping.
 */
async function main() {
    // 1. Récupérer les arguments de la ligne de commande
    // On ignore le premier argument si c'est '--' (ajouté par npm)
    let args = process.argv.slice(2);
    if (args[0] === '--') args = args.slice(1);

    // Le premier argument est le nom de la source.
    const sourceName = args[0];
    // Le deuxième argument (optionnel) est le mode ('test').
    const isTestMode = args[1] === 'test';

    if (isTestMode) {
        console.log("🧪 Mode test activé.");
        console.log("-> Nettoyage des anciens fichiers de test et logs...");
        const testDir = path.join(process.cwd(), 'data', 'test');
        try {
            // Tente de lire le contenu du dossier. S'il n'existe pas, l'erreur est capturée.
            const files = await fs.readdir(testDir);
            const unlinkPromises = [];
            for (const file of files) {
                // Supprime les fichiers de données et de log de test
                if ((file.startsWith(`${sourceName}-`) && file.endsWith('.test.json')) || file === `errors-${sourceName}.log`) {
                    unlinkPromises.push(fs.unlink(path.join(testDir, file)));
                }
            }
            if (unlinkPromises.length > 0) {
                await Promise.all(unlinkPromises);
            }
            console.log("-> Nettoyage terminé.");
        } catch (err) {
            // Si le dossier n'existe pas (ENOENT), on ignore l'erreur. Sinon, on l'affiche.
            if (err.code !== 'ENOENT') {
                console.error("❌ Erreur lors du nettoyage des fichiers de test:", err);
            }
        }
    }

    // 2. Vérifier si un nom de source a été fourni
    if (!sourceName) {
        console.error("❌ Erreur : Vous devez spécifier un nom de source.");
        console.log("Exemple : node main.js frenchFab");
        process.exit(1); // Arrête le script avec un code d'erreur
    }

    console.log(chalk.bgBlueBright.black(`\n\n--- 🚀 DÉMARRAGE DU PIPELINE COMPLET POUR LA SOURCE : ${sourceName} ---\n`));

    try {
        // 3. Importer dynamiquement le module scraper correspondant
        const scraperPath = `./scrapers/${sourceName}.js`;
        const scraperModule = await import(scraperPath);
        const scraper = scraperModule.default; // On récupère l'objet exporté par "export default"

        // 4. Lancer le pipeline avec la configuration dynamique
        // Étape 1 : Récupère la liste des URLs
        await pipeline.runGetListStep(sourceName, scraper, isTestMode);

        // Étape 2 : Scrape les détails de chaque page
        await pipeline.runGetDetailsStep(sourceName, scraper, isTestMode);

        // Étape 3a : Enrichit avec l'API SIRENE
        await enrich.enrichWithSirene(sourceName, isTestMode);

        // Étape 3b : Enrichit avec les URLs LinkedIn
        await enrich.enrichWithLinkedIn(sourceName, isTestMode);

        // Étape 4 : Convertit les données finales en fichiers CSV
        await convertToCsv(sourceName, isTestMode);

        console.log(chalk.bgBlueBright.black(`\n\n--- ✅ PIPELINE TERMINÉ AVEC SUCCÈS POUR LA SOURCE : ${sourceName} ---\n`));

    } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
            console.error(chalk.red.bold(`\n\n--- ❌ ERREUR CRITIQUE ---`));
            console.error(`Le scraper pour la source "${sourceName}" n'a pas été trouvé.`);
            console.error(`Veuillez vérifier qu'un fichier nommé "${sourceName}.js" existe bien dans le dossier "/scrapers".`);
        } else {
            console.error(chalk.red.bold("\n\n--- ❌ UNE ERREUR CRITIQUE A ARRÊTÉ LE PIPELINE ---"));
            console.error(error);
        }
        process.exit(1);
    }
}

main();

// --- PISTES D'AMÉLIORATION FUTURES ---

// TODO - Parallélisation: Intégrer une librairie comme 'p-limit' pour paralléliser les étapes longues (ex: runGetDetailsStep, enrichWithLinkedIn) afin d'accélérer le traitement des grosses sources.

// TODO - Gestion des Proxies: Ajouter un système de rotation de proxies (via un service externe) dans les requêtes fetch et Puppeteer pour éviter les blocages d'IP lors de scraping à grande échelle.

// TODO - Gestion des CAPTCHAs: Implémenter une solution de résolution de CAPTCHA (ex: 2Captcha, Anti-Captcha) pour gérer les blocages sur les sites qui en présentent (notamment Google/DuckDuckGo lors de la recherche LinkedIn).

// TODO - Intégration Google Sheets: Créer une interface via Google Apps Script pour piloter le pipeline depuis une feuille de calcul. Cela impliquerait probablement de transformer ce script en une API ou un service cloud (ex: Google Cloud Function) que le Google Sheet pourrait appeler pour lancer les tâches et récupérer les résultats.

// TODO - Sécurité: Si des clés d'API ou des identifiants sont ajoutés à l'avenir, les déplacer dans un fichier .env et utiliser une librairie comme 'dotenv' pour les charger, au lieu de les coder en dur.