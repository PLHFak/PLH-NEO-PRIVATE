# PLH NEO · Bureau

Site local pour configurer et piloter le **Stream Deck Neo « Bureau »** : radios musicales, YouTube Music, news, podcasts et raccourcis Mac.
Le second Neo (**DUPLEX**) n'est jamais touché : le site ne pilote que le Neo dont le numéro de série a été associé.

## Démarrage (Mac)

```bash
git clone https://github.com/PLHFak/PLH-NEO-PRIVATE.git
cd PLH-NEO-PRIVATE
node server.mjs
```

Puis ouvrir **http://localhost:4321** dans **Chrome** (WebHID n'existe pas dans Safari).
Aucune installation de paquets n'est nécessaire (Node 18 ou plus).

1. **Associer…** → choisir un Neo → il s'allume en rose → confirmer que c'est bien le Neo *Bureau*.
2. Ensuite, **Connecter le Neo Bureau** (reconnexion automatique aux visites suivantes).
3. Laisser l'onglet ouvert : le son sort par les enceintes du Mac.

## Utilisation du Neo

| Élément | Rôle |
|---|---|
| 8 touches | presets de la page en cours |
| Touche tactile ◀ | page précédente · **appui long** : 1re page |
| Touche tactile ▶ | page suivante |
| Écran (infobar) | nom de la page, n° de page, lecture en cours, heure |

Pages par défaut : **Musique · FIP** · **Musique · YouTube Music** · **News · Radio** (BFM Business, franceinfo, Inter…) · **Podcasts** · **Bureau · Raccourcis**.

## Configuration

- Clic sur une touche = la déclencher · **crayon** ou **Alt + clic** = la modifier · glisser-déposer = permuter.
- Types d'action : radio, site web, podcast (dernier épisode), raccourci clavier Mac, ouverture d'app, aller à une page, pause, stop, volume.
- Radio et podcast : champ de recherche intégré (annuaires radio-browser.info et Apple Podcasts) — plus besoin de connaître l'URL du flux.
- Config enregistrée dans `config/neo-bureau.json` (sauvegarde précédente en `.bak`), export/import JSON.

## Points à connaître

- **Sortie audio / HomePod** : carte « Sortie audio » → *AirPlay via l’app Musique*, puis cocher les HomePod. Le son part en AirPlay, indépendamment de la sortie du Mac. À la 1re utilisation, macOS demande d’autoriser le Terminal à piloter « Musique ».

- **Raccourcis clavier** : à la 1re utilisation, macOS demande l'autorisation *Accessibilité* pour le Terminal (Réglages Système → Confidentialité et sécurité → Accessibilité).
- **Logiciel Elgato Stream Deck** : s'il tourne, il redessine aussi le Neo Bureau. Le quitter, ou ne lui laisser gérer que le Neo DUPLEX.
- **YouTube Music** n'a pas d'API de lecture : les touches ouvrent la playlist ou la recherche dans le navigateur.
- Le serveur n'écoute que sur `127.0.0.1` (pas accessible depuis le réseau).

## Structure

```
server.mjs                 serveur local sans dépendance (site + actions Mac + recherches)
public/index.html, app.js  interface, simulateur du Neo, pilotage WebHID
public/default-config.json presets d'origine
public/vendor/streamdeck.js bibliothèque @elgato-stream-deck/webhid (pré-compilée)
config/neo-bureau.json     ta configuration (créée au 1er enregistrement)
docs/PROPOSITION.md        arborescence et feuille de route
```

Recompiler la bibliothèque (rarement utile) : `npm install && npm run build:vendor`.
