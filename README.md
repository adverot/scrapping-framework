# Projet de Scraping Modulaire

Ce projet est un framework réutilisable pour scraper des données depuis diverses sources web de manière robuste et reprenable. L'architecture est conçue pour être modulaire, permettant d'ajouter de nouvelles sources facilement en créant des "scrapers" spécifiques.

---

## Comment ajouter un nouveau scraper

Chaque scraper est un module indépendant qui contient la logique nécessaire pour extraire les données d'un site web spécifique. Pour ajouter une nouvelle source (par exemple, "annuaireXyz"), suivez ces trois étapes :

### 1. Créer le fichier du scraper

Créez un nouveau fichier dans le dossier `/scrapers`. Le nom du fichier doit correspondre au nom de la source que vous souhaitez scraper.

-   **Exemple :** Pour la source "FrenchFab", le fichier est `scrapers/frenchFab.js`.
-   **Exemple :** Pour une nouvelle source "Annuaire XYZ", le fichier serait `scrapers/annuaireXyz.js`.

---

### 2. Implémenter les fonctions requises

Votre fichier scraper **doit** contenir et exporter deux fonctions asynchrones nommées `getList` et `getDetails`. Ces fonctions agissent comme un "contrat" que le pipeline utilisera pour communiquer avec votre scraper.

#### `async function getList()`

-   **Rôle :** Scraper la liste initiale de toutes les cibles (entreprises, produits, etc.) depuis l'annuaire.
-   **Retourne :** Une `Promise` qui se résout avec un **tableau d'objets**. Chaque objet doit contenir au minimum les clés `nom` et `lien`.

    ```javascript
    /**
     * @returns {Promise<Array<{nom: string, lien: string}>>}
     */
    async function getList() {
      // Votre logique de scraping de la liste ici...
      return [
        { nom: "Entreprise A", lien: "[https://example.com/a](https://example.com/a)" },
        { nom: "Entreprise B", lien: "[https://example.com/b](https://example.com/b)" },
      ];
    }
    ```

#### `async function getDetails(lien)`

-   **Rôle :** Scraper la page de détail d'une seule cible.
-   **Paramètre :** Prend une chaîne de caractères `lien` (l'URL de la page à visiter).
-   **Retourne :** Une `Promise` qui se résout avec un **objet** contenant toutes les données détaillées que vous avez extraites.

    ```javascript
    /**
     * @param {string} lien - L'URL de la page à scraper.
     * @returns {Promise<object>}
     */
    async function getDetails(lien) {
      // Votre logique de scraping de la page de détail ici...
      return {
        description: "...",
        codePostal: "...",
        website: "...",
        // etc.
      };
    }
    ```

---

### 3. Exporter les fonctions

À la fin de votre fichier scraper, vous **devez** exporter les deux fonctions en utilisant un `export default`.

```javascript
// A la fin de votre fichier scrapers/monNouveauScraper.js
export default { getList, getDetails };
```

---

### Modèle de base

Vous pouvez utiliser ce modèle comme point de départ pour tout nouveau scraper :

```javascript
// Fichier: /scrapers/template_scraper.js

import fetch from 'node-fetch';
import cheerio from 'cheerio';

/**
 * Récupère la liste de base.
 * @returns {Promise<Array<{nom: string, lien: string}>>}
 */
async function getList() {
  console.log("-> Lancement de getList pour la nouvelle source...");
  // ... Logique pour scraper la liste des URLs ...
  const results = [
    // { nom: "...", lien: "..." }
  ];
  console.log(`-> getList a trouvé ${results.length} éléments.`);
  return results;
}

/**
 * Scrape les détails d'une seule page.
 * @param {string} lien - L'URL de la page à scraper.
 * @returns {Promise<object>}
 */
async function getDetails(lien) {
  // ... Logique pour scraper une page de détail ...
  const details = {
    // ...
  };
  return details;
}

export default { getList, getDetails };
```