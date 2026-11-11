# Benchmark IRP

```bash
cd tests && npm install        # jsdom + axe-core (dev uniquement)
node ../bench/make-fixtures.mjs   # (re)génère les 20 pages synthétiques et manifest.json
node ../bench/run.mjs             # écrit bench/results.json et bench/REPORT.md
```

Mesure, pour chaque page : extraction → rendu (4 profils) → adaptation FALC → axe-core avant/après → poids → IA « hostile » simulée.
**Mesurer vos pages réelles** : enregistrez leur HTML dans un dossier (`<id>.html`), créez un `manifest.json`
(`[{ "id": "…", "kind": "…", "layout": "…", "title": "…", "must_show": ["25 €", "15 mars 2027"] }]`) puis
`node run.mjs --dir <dossier> --manifest <fichier> --out <sortie>`. Les faits `must_show` sont ceux qu'un lecteur ne doit jamais perdre.

Résultats et limites : voir `REPORT.md` (axe sous jsdom ne mesure pas les contrastes ; corpus synthétique ; lisibilité = mesure automatique).
