import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');

/**
 * Lit et retourne les données d'une étape de scraping sauvegardée.
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {string} stepName - Le nom de l'étape (ex: 'urls', 'details').
 * @returns {Array} - Un tableau avec les données de l'étape, ou un tableau vide en cas d'erreur ou si le fichier n'existe pas.
 */
export function getStep(sourceName, stepName) {
    const filePath = path.join(dataDir, `${sourceName}-${stepName}.json`);

    try {
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        }
    } catch (error) {
        console.error(`❌ Erreur lors de la lecture ou du parsing du fichier ${filePath}:`, error);
        // En cas de fichier corrompu, on repart de zéro pour cette étape.
    }

    return []; // Retourne un tableau vide si le fichier n'existe pas ou s'il y a une erreur.
}

/**
 * Sauvegarde les données d'une étape de scraping dans un fichier JSON.
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {string} stepName - Le nom de l'étape (ex: 'urls', 'details').
 * @param {object|Array} data - Les données à sauvegarder.
 */
export function setStep(sourceName, stepName, data) {
    const filePath = path.join(dataDir, `${sourceName}-${stepName}.json`);

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