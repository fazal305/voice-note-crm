# Credits

Third-party assets used in Voice Note CRM, with their sources and licenses.

## Fonts

Both fonts are self-hosted from the npm packages below (latin subset only), so no requests go to a font CDN.

| Font | Used for | Source | License |
| --- | --- | --- | --- |
| Instrument Serif (regular and italic) | Headings | [Instrument Serif Project Authors](https://github.com/Instrument/instrument-serif), packaged by [@fontsource/instrument-serif](https://fontsource.org/fonts/instrument-serif) | [SIL Open Font License 1.1](https://openfontlicense.org) |
| Hanken Grotesk (400, 500, 600, 700) | Body text and UI | [Hanken Grotesk Project Authors](https://github.com/marcologous/hanken-grotesk), packaged by [@fontsource/hanken-grotesk](https://fontsource.org/fonts/hanken-grotesk) | [SIL Open Font License 1.1](https://openfontlicense.org) |

## Icons and images

- **Icons:** the navigation, recording and status icons are simple stroke paths written by hand as inline SVG in the components. No icon library or icon font is used.
- **Logo and favicon** (`web/public/favicon.svg`, `web/public/apple-touch-icon.png`): made for this project.
- **Social preview image** (`web/public/og-image.png`) and **screenshots** (`docs/screenshots/`): screenshots of the app itself, showing the demo organization's made-up sample data.

## Sample data

The demo organization's clients, companies, emails and phone numbers are invented. Email addresses use reserved example domains and phone numbers use the fictional 555 range.

## Software

The app is built on open-source libraries (Laravel, React, React Router, Vite, Tailwind CSS and others), each under its own license. They are listed in `api/composer.json` and `web/package.json`.
