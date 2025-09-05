import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');

/**
 * Lit et retourne les données d'une étape de scraping sauvegardée.
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {string} stepName - Le nom de l'étape (ex: 'urls', 'details').
 * @returns {Array} - Un tableau avec les données de l'étape, ou un tableau vide en cas d'erreur ou si le fichier n'existe pas.
 * @param {boolean} [test=false] - Indique si on est en phase de test (dataset réduits) ou non
 */
export function getStep(sourceName, stepName, test = false) {
    const filePath = test ? path.join(dataDir, `${sourceName}-${stepName}.test.json`) : path.join(dataDir, `${sourceName}-${stepName}.json`);

    try {
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        }
    } catch (error) {
        console.error(`❌ Erreur lors de la lecture ou du parsing du fichier ${filePath}:`, error);
    }

    return [];
}

/**
 * Sauvegarde les données d'une étape de scraping dans un fichier JSON.
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {string} stepName - Le nom de l'étape (ex: 'urls', 'details').
 * @param {object|Array} data - Les données à sauvegarder.
 * @param {boolean} [test=false] - Indique si on est en phase de test (dataset réduits) ou non
 */
export function setStep(sourceName, stepName, data, test = false) {
    const filePath = test ? path.join(dataDir, `${sourceName}-${stepName}.test.json`) : path.join(dataDir, `${sourceName}-${stepName}.json`);

    try {
        // S'assure que le dossier /data existe.
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // On écrit les données dans un format lisible pour le débogage.
        const jsonContent = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonContent, 'utf-8');
    } catch (error) {
        console.error(`❌ Erreur lors de l'écriture du fichier ${filePath}:`, error);
    }
}

export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}