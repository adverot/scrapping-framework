import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import chalk from 'chalk';

const TEST_MODE_LIMIT = 20; // Limite le nombre d'éléments à scraper en mode test

/**
 * Récupère la liste de base de toutes les entreprises de l'annuaire.
 * @param {boolean} [isTestMode=false] - Si true, retourne un jeu de données limité.
 * @returns {Promise<Array<{nom: string, lien: string}>>}
 */
async function getList(isTestMode = false) {
    console.log("-> Démarrage de getList pour French Fab...");
    const directoryUrl = 'https://www.lafrenchfab.fr/annuaire/';
    const apiUrl = 'https://www.lafrenchfab.fr/ajax-call';

    const initialResponse = await fetch(directoryUrl);
    const pageHtml = await initialResponse.text();
    const match = pageHtml.match(/"goat":\s*"([a-f0-9]+)"/);

    if (!match || !match[1]) {
        throw new Error("Impossible de trouver le jeton de sécurité (goat/nonce).");
    }
    const nonceValue = match[1];

    console.log("-> Récupération des entreprises...");
    let companyList = [];
    let excludedIds = [];
    let hasMorePages = true;
    let pageNum = 1;

    while (hasMorePages) {
        const bodyParams = new URLSearchParams();
        bodyParams.append('action', 'load_more_entreprises');
        bodyParams.append('goat', nonceValue);
        bodyParams.append('context', 'entreprise');
        excludedIds.forEach(id => bodyParams.append('excluded_posts[]', id));

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referer': directoryUrl
            },
            body: bodyParams
        });
        const data = await apiResponse.json();

        if (!data.html || data.nbresults === 0) {
            hasMorePages = false;
            continue;
        }

        const $ = cheerio.load(data.html);
        $('li[data-id]').each((index, element) => {
            const companyElement = $(element);
            const id = companyElement.attr('data-id');
            excludedIds.push(id);
            companyList.push({
                nom: companyElement.find('.directory__title').text().trim(),
                lien: companyElement.find('a.directory__item').attr('href'),
            });
        });

        // Si on est en mode test et qu'on a atteint la limite, on arrête.
        if (isTestMode && companyList.length >= TEST_MODE_LIMIT) {
            hasMorePages = false;
        }

        // ✨ La mise à jour sur une seule ligne ✨
        const status = `   -> Page ${chalk.blue(pageNum)} traitée | ${chalk.green(companyList.length)} entreprises trouvées`;
        process.stdout.write(status + '\r'); // Le '\r' déplace le curseur au début de la ligne

        pageNum++;
    }

    process.stdout.write('\n'); // On fait un saut de ligne final
    console.log(`\n-> getList a terminé. ${companyList.length} entreprises trouvées.`);
    return companyList;
}

/**
 * Scrape les détails d'une seule page entreprise.
 * @param {string} lien - L'URL de la page à scraper.
 * @returns {Promise<object>} - Un objet avec les détails de l'entreprise.
 */
async function getDetails(lien) {
    const response = await fetch(lien);
    if (!response.ok) {
        throw new Error(`Échec du chargement de la page ${lien} (statut: ${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const infos = {
        description: $('div.fl-rich-text p').eq(1)?.text()?.trim() ?? '',
        website: $('div.pp-button-wrap.pp-button-width-auto a').first()?.attr('href') ?? '',
        coordonnees: $('div.uabb-subheading.uabb-text-editor').eq(0)?.text()?.trim() ?? '',
        region: $('div.uabb-subheading.uabb-text-editor').eq(1)?.text()?.trim() ?? '',
        structure: $('div.uabb-subheading.uabb-text-editor').eq(2)?.text()?.trim() ?? '',
        secteur: $('div.uabb-subheading.uabb-text-editor').eq(3)?.text()?.trim() ?? '',
        contact: $('div.uabb-subheading.uabb-text-editor').eq(4)?.text()?.trim() ?? ''
    };

    const codePostalMatch = infos.coordonnees.match(/\d{5}/);
    const codePostal = codePostalMatch ? codePostalMatch[0] : '';

    // On retourne un objet structuré avec les données nettoyées
    return {
        type: infos.structure,
        secteur: infos.secteur,
        description: infos.description,
        website: infos.website,
        adresse: infos.coordonnees.split(' - ')[0]?.replace(codePostal, '').trim() ?? '',
        codePostal: codePostal,
        ville: infos.coordonnees.split(' - ')[1]?.trim() ?? '',
        region: infos.region,
        contact: infos.contact
    };
}

// On exporte les deux fonctions pour que le pipeline puisse les utiliser
export default { getList, getDetails };