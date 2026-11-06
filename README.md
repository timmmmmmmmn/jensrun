# Jens Run

Een endless runner door Nijmegen die eruitziet als een echte PS1-game. Speel hem op **https://jensrun.timvanbergen.nl**.

- **Endless:** ren door Nijmegen-Oost, pak de KNVB-bekers, ontwijk alles en laat je niet pakken. Met een beetje geluk staat de lerarenkamer in het Montessori open.
- **Asbest, Vuurwerk en Mijn Osso:** eigen spellen met een eigen wereld.
- **Verhaal:** *Terroriseer Nijmegen* (8 wijken, eindbaas in Hatert) en *Terroriseer Nederland* (10 levels, finale in de Johan Cruijff ArenA).
- **Winkel, opdrachten, ranglijst en Wall of Fame.**

## Spelen als app

- **iPhone:** open de site in Safari → Deel → *Zet op beginscherm*. De web-app werkt zichzelf bij.
- **Android:** download `JensRun.apk` bij de [nieuwste release](https://github.com/timmmmmmmmn/jensrun/releases/latest). De app controleert zelf op updates.

## Opbouw

| Map | Wat |
|---|---|
| `public/` | De game: `index.html`, `game.js` (three.js, geen build-stap), `style.css`, audio en plaatjes |
| `src/worker.js` | Cloudflare Worker: ranglijst en Wall of Fame (D1-database) |
| `migrations/` | D1-databaseschema |
| `android/` | Android-app (WebView + automatische updater) |
| `.github/workflows/apk.yml` | Bouwt bij elke wijziging aan `android/` een ondertekende APK als release |

Lokaal draaien: `npx wrangler dev`. Live zetten: `npx wrangler deploy`.

## Met dank aan

- 3D-model van de KNVB-beker: stresvogel (gebruikt met toestemming, teruggebracht tot PS1-formaat in `public/beker-model.js`)
- Iconen: [game-icons.net](https://game-icons.net) (CC BY 3.0), vlaggen: [flag-icons](https://github.com/lipis/flag-icons) (MIT)
- Lettertypen: Anton en Barlow Semi Condensed (OFL)
- Nieuws in het hoofdmenu zet je via `/beheer` (met plaatje en einddatum)
