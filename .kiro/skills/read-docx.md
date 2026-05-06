# Skill — Lire et extraire le contenu d'un fichier DOCX

## Quand utiliser ce skill
Quand tu dois lire, analyser ou extraire du contenu depuis un fichier `.docx` (Word) dans le projet.

## Méthode 1 — Via le MCP filesystem (recommandé si connecté)
Si le serveur MCP `filesystem` est actif, utilise l'outil `read_file` directement sur le fichier `.docx`.
Le contenu sera retourné en texte brut extrait du document.

## Méthode 2 — Via Python + python-docx (ligne de commande)
```bash
# Extraire tout le texte d'un .docx
uvx --with python-docx python -c "
import docx
doc = docx.Document('chemin/vers/fichier.docx')
for para in doc.paragraphs:
    if para.text.strip():
        print(para.text)
"
```

## Méthode 3 — Via Node.js + mammoth (si environnement Node disponible)
```bash
# Extraire le texte brut d'un .docx
npx -y mammoth chemin/vers/fichier.docx --output-format=text
```

## Méthode 4 — Via PowerShell (Windows, sans dépendances)
```powershell
# Extraire le texte d'un .docx en décompressant le ZIP interne
$docxPath = "chemin\vers\fichier.docx"
$tempDir = "$env:TEMP\docx_extract"
Expand-Archive -Path $docxPath -DestinationPath $tempDir -Force
[xml]$xml = Get-Content "$tempDir\word\document.xml"
$xml.document.body.p | ForEach-Object { $_.r.t } | Where-Object { $_ } | Out-String
Remove-Item $tempDir -Recurse -Force
```

## Méthode 5 — Lire via Kiro directement
Kiro peut lire les fichiers `.docx` attachés en chat (glisser-déposer ou icône trombone).
Pour les fichiers déjà dans le workspace, utilise l'outil `readFile` — Kiro extrait automatiquement le texte.

## Cas d'usage dans ce projet
- Lire le cahier des charges (`docs/Cahier des Charges – Application Mo.txt`)
- Analyser des documents de spécification fournis par le client
- Extraire des données de formulaires Word pour les intégrer dans la config CRM

## Notes importantes
- Les fichiers `.docx` sont des archives ZIP contenant du XML (`word/document.xml`)
- Les images et tableaux complexes peuvent ne pas être extraits correctement en texte brut
- Pour les tableaux, `python-docx` est plus fiable que mammoth
- Toujours vérifier l'encodage UTF-8 pour les caractères français (accents, etc.)

## Exemple complet — Extraire paragraphes ET tableaux
```python
import docx

doc = docx.Document('fichier.docx')

# Paragraphes
print("=== PARAGRAPHES ===")
for para in doc.paragraphs:
    if para.text.strip():
        print(para.text)

# Tableaux
print("=== TABLEAUX ===")
for i, table in enumerate(doc.tables):
    print(f"-- Tableau {i+1} --")
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        print(' | '.join(cells))
```
