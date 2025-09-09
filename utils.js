import fs from 'fs/promises';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import chalk from 'chalk';

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

/**
 * Convertit les données du fichier final.json en deux fichiers CSV (entreprises et dirigeants).
 * @param {string} sourceName - Le nom de la source (ex: 'french_fab').
 * @param {boolean} [isTestMode=false] - Indique si on est en mode test.
 */
export async function convertToCsv(sourceName, isTestMode = false) {
    console.log(chalk.blue("🔄 Conversion des données finales en CSV..."));

    const finalData = await getStep(sourceName, 'final', isTestMode);
    if (!finalData || finalData.length === 0) {
        console.log(chalk.yellow("Aucune donnée finale à convertir."));
        return;
    }

    // Définir le dossier de sortie en fonction du mode (test ou prod)
    const outputDir = path.join(process.cwd(), 'data', isTestMode ? 'test' : sourceName);

    // --- 1. Préparation des données pour les entreprises ---
    const companiesData = finalData.map(company => ({
        recordId: company.id ?? '',
        nom: company.scrap_nom ?? '',
        description: company.scrap_description ?? '',
        domaine: company.domain ?? '',
        website: company.scrap_website ?? '',
        linkedin: company.linkedinUrl !== 'ERREUR' ? company.linkedinUrl : '',
        telephone: company.scrap_telephone ?? '',
        ville: company.scrap_ville ?? company.sirene_ville ?? '',
        region: company.sirene_region ?? '',
        siren: company.sirene_siren ?? '',
        activite: company.sirene_activite ?? '',
        ca: company.sirene_ca ?? '',
        annee_ca: company.sirene_annee_ca ?? '',
        effectifs: company.sirene_effectifs ?? '',
        annee_effectifs: company.sirene_annee_effectifs ?? '',
        sirene_region: company.sirene_region ?? '',
        sirene_dep_code: company.siren_departement_code ?? '',
        sirene_dep_nom: company.sirene_departement ?? '',
        sirene_ville: company.sirene_ville ?? '',
        sirene_adresse: company.sirene_adresse ?? '',
        source: '' // Laissé vide comme demandé
    }));

    // --- 2. Préparation des données pour les dirigeants ---
    let dirigeantIdCounter = 0;
    const dirigeantsData = finalData.flatMap(company => {
        if (!company.dirigeants || company.dirigeants.length === 0) {
            return [];
        }
        return company.dirigeants.map(dirigeant => ({
            // Assure que chaque dirigeant a un ID, même ceux venant du scraper sans enrichissement SIRENE
            id: dirigeant.id || `PER-${String(++dirigeantIdCounter).padStart(5, '0')}`,
            prenom: dirigeant.prenom ?? '',
            nom: dirigeant.nom ?? '',
            fonction: (dirigeant.fonction === 'null' || !dirigeant.fonction) ? '' : dirigeant.fonction,
            entreprise: dirigeant.entreprise || company.scrap_nom,
            idEntreprise: dirigeant.idEntreprise || company.id || ''
        }));
    }
    );

    // --- 3. Génération du CSV des entreprises ---
    try {
        const csvEntreprises = stringify(companiesData, {
            header: true,
            columns: [
                { key: 'recordId', header: 'Record ID Externe Entreprise' },
                { key: 'nom', header: 'Nom de l\'entreprise' },
                { key: 'description', header: 'Description' },
                { key: 'domaine', header: 'Nom de domaine de l\'entreprise' },
                { key: 'website', header: 'URL du site web' },
                { key: 'linkedin', header: 'Page d\'entreprise LinkedIn' },
                { key: 'telephone', header: 'Numéro de téléphone' },
                { key: 'ville', header: 'Ville' },
                { key: 'region', header: 'État/Région' },
                { key: 'siren', header: 'SIREN' },
                { key: 'activite', header: 'SIRENE - Division activité' },
                { key: 'ca', header: 'SIRENE - CA unité légale' },
                { key: 'annee_ca', header: 'SIRENE - Année CA unité légale' },
                { key: 'effectifs', header: 'SIRENE - Tranche effectifs unité légale' },
                { key: 'annee_effectifs', header: 'SIRENE - Année effectifs unité légales' },
                { key: 'sirene_region', header: 'SIRENE - Région' },
                { key: 'sirene_dep_code', header: 'SIRENE - Dep' },
                { key: 'sirene_dep_nom', header: 'SIRENE - Département' },
                { key: 'sirene_ville', header: 'SIRENE - Ville' },
                { key: 'sirene_adresse', header: 'SIRENE - Adresse postale siège' },
                { key: 'source', header: 'Source Scraping Entreprise' }
            ]
        });
        const outputPath = path.join(outputDir, `entreprises${isTestMode ? '.test' : ''}.csv`);
        await fs.writeFile(outputPath, csvEntreprises, 'utf-8');
        console.log(chalk.green(`✅ Fichier entreprises.csv généré avec succès : ${outputPath}`));
    } catch (error) {
        console.error(chalk.red("❌ Erreur lors de la génération du CSV des entreprises:"), error);
    }

    // --- 4. Génération du CSV des dirigeants ---
    if (dirigeantsData.length > 0) {
        try {
            const csvDirigeants = stringify(dirigeantsData, {
                header: true,
                columns: [
                    { key: 'id', header: "ID" },
                    { key: 'prenom', header: "Prénom" },
                    { key: 'nom', header: "Nom" },
                    { key: 'fonction', header: "Fonction" },
                    { key: 'entreprise', header: "Entreprise" },
                    { key: 'idEntreprise', header: "ID Entreprise" },
                ]
            });
            const outputPath = path.join(outputDir, `dirigeants${isTestMode ? '.test' : ''}.csv`);
            await fs.writeFile(outputPath, csvDirigeants, 'utf-8');
            console.log(chalk.green(`✅ Fichier dirigeants.csv généré avec succès : ${outputPath}`));
        } catch (error) {
            console.error(chalk.red("❌ Erreur lors de la génération du CSV des dirigeants:"), error);
        }
    } else {
        console.log(chalk.yellow("🟡 Aucun dirigeant trouvé, le fichier dirigeants.csv n'a pas été créé."));
    }
}