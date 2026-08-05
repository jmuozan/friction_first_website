# Plantilla LaTeX — estil editorial

Plantilla inspirada en l'estil dels fullets de referència a `../ref/`:
regla vertical d'accent al marge interior, números de pàgina i bloc de
contacte en color d'accent, titulars amb Circular Std i cos de text amb
Helvetica Neue Light.

## Compilar

Cal **XeLaTeX** (per `fontspec`):

```
xelatex main.tex
xelatex main.tex   # segona passada: posiciona la regla/foli (remember picture)
```

## Estructura

- `main.tex` — document mestre: només `\input{...}` de cada pàgina, amb
  `\newpage` entremig
- `sections/` — una pàgina per fitxer `.tex`:
  - `00-cover.tex` — portada (basada en `ref/cover.png`)
  - `01-index.tex` — índex (basada en `ref/index.png`)
  - `02-fonaments-de-programacio.tex` — pàgina de secció (basada en
    `ref/starter_page_1.png` + `ref/starter_page_2.png`)
- `style.sty` — colors, tipografies i totes les comandes de disseny
- `fonts/CircularStd-Medium.ttf` — còpia local del tipus de lletra dels
  titulars (Helvetica Neue es carrega pel nom des del sistema, ja que és
  una font d'Apple preinstal·lada)

### Afegir una secció nova

1. Crea `sections/03-nom-de-la-seccio.tex` seguint l'estructura d'una
   pàgina existent (normalment `\accentfolio` + `\marginfooter{...}` +
   `\articletitle{...}` + cos de text).
2. A `main.tex`, afegeix `\newpage` seguit de `\input{sections/03-nom-de-la-seccio}`.
3. Actualitza el número de pàgina corresponent a `sections/01-index.tex`.

## Comandes disponibles (`style.sty`)

- `\headline{...}` — titular gran en Circular Std
- `\eyebrow{...}` — línia destacada/cita a sobre del titular
- `\kicker{...}` — cap de secció petit en Circular Std
- `\subhead{...}` — subtítol de cos de text
- `\indexentry{Text}{núm}` — entrada d'índex petita, amb número en color d'accent
- `\indexheading{...}` — títol de la pàgina d'índex
- `\bigindexentry{Text}{núm}` — entrada d'índex gran en majúscules, amb
  regla gruixuda a sota
- `\articletitle{...}` — titular d'article amb regla completa a sota
- `\metabox{...}` — línia petita de metadades (mòdul, durada, modalitat...)
- `\columndivider{x}{y0}{y1}` — regla vertical entre dues columnes de cos
- `\coverfield{Etiqueta}{Valor}` — un dels quatre camps de la capçalera de portada
- `\halftoneblock{x0}{y0}{amplada}{alçada}` — bloc de textura duotò darrere el títol de portada
- `\contactblock{...}` — bloc de contacte/peu en color d'accent
- `\accentfolio` — número de pàgina gran a la cantonada inferior
- `\marginfooter{...}` — text girat 90° al peu del marge (crèdit de foto, etc.)
- `\marginrule` / `\marginticknorth` — regla o marca vertical al marge
  interior (actualment sense ús a `sections/`, disponible si es vol
  recuperar)

Per canviar el color d'accent, edita `\definecolor{accent}{HTML}{E84438}`
a `style.sty`.
