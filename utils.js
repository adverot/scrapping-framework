import fs from 'fs/promises';
import path from 'path';

/**
 * Lit et retourne les données d'une étape de scraping sauvegardée.
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {string} stepName - Le nom de l'étape (ex: 'urls', 'details').
 * @param {boolean} [test=false] - Indique si on est en phase de test (dataset réduits) ou non
 * @returns {Promise<Array>} - Une promesse qui résout avec les données de l'étape, ou un tableau vide en cas d'erreur ou si le fichier n'existe pas.
 */
export async function getStep(sourceName, stepName, test = false) {
    let filePath;
    if (test) {
        filePath = path.join(process.cwd(), 'data', 'test', `${sourceName}-${stepName}.test.json`);
    } else {
        filePath = path.join(process.cwd(), 'data', sourceName, `${stepName}.json`);
    }
    
    try {
        // fs.access lève une erreur si le fichier n'existe pas, ce qui est géré par le catch.
        await fs.access(filePath); 
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        // Si le fichier n'existe pas (ENOENT), on retourne un tableau vide sans logger d'erreur.
        if (error.code !== 'ENOENT') {
            console.error(`❌ Erreur lors de la lecture ou du parsing du fichier ${filePath}:`, error);
        }
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
export async function setStep(sourceName, stepName, data, test = false) {
    let filePath;
    if (test) {
        filePath = path.join(process.cwd(), 'data', 'test', `${sourceName}-${stepName}.test.json`);
    } else {
        filePath = path.join(process.cwd(), 'data', sourceName, `${stepName}.json`);
    }
    
    try {
        // S'assure que le dossier de destination existe.
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // On écrit les données dans un format lisible pour le débogage.
        const jsonContent = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, jsonContent, 'utf-8');
    } catch (error) {
        console.error(`❌ Erreur lors de l'écriture du fichier ${filePath}:`, error);
    }
}

/**
 * Centralise la journalisation des erreurs dans un fichier unique.
 * @param {string} sourceName - Le nom de la source.
 * @param {string} stepName - Le nom de l'étape où l'erreur s'est produite.
 * @param {Error} error - L'objet d'erreur capturé.
 * @param {object} [context={}] - Contexte supplémentaire (ex: l'item en cours de traitement).
 * @param {boolean} [isTestMode=false] - Indique si on est en mode test pour nommer le fichier de log.
 */
export async function logError(sourceName, stepName, error, context = {}, isTestMode = false) {
    let logFilePath;
    if (isTestMode) {
        logFilePath = path.join(process.cwd(), 'data', 'test', `errors-${sourceName}.log`);
    } else {
        logFilePath = path.join(process.cwd(), 'data', sourceName, `errors.log`);
    }

    const timestamp = new Date().toISOString();

    const contextString = Object.keys(context).length > 0 ? ` | Contexte: ${JSON.stringify(context)}` : '';

    const logMessage = `
--- ERROR ---
Timestamp: ${timestamp}
Source: ${sourceName}
Étape: ${stepName}${contextString}
Message: ${error.message}
Stack Trace:
${error.stack}
`;

    try {
        const dir = path.dirname(logFilePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(logFilePath, logMessage, 'utf-8');
    } catch (writeError) {
        console.error(`❌ ERREUR CRITIQUE: Impossible d'écrire dans le fichier de log ${logFilePath}:`, writeError);
    }
}

export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}