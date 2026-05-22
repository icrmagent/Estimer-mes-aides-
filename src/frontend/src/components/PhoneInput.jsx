import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import s from './PhoneInput.module.css'

const COUNTRIES = [
  { code: 'FR', name: 'France',                       dial: '+33'   },
  { code: 'ZA', name: 'Afrique du Sud',               dial: '+27'   },
  { code: 'AL', name: 'Albanie',                      dial: '+355'  },
  { code: 'DZ', name: 'Algérie',                      dial: '+213'  },
  { code: 'DE', name: 'Allemagne',                    dial: '+49'   },
  { code: 'AD', name: 'Andorre',                      dial: '+376'  },
  { code: 'AO', name: 'Angola',                       dial: '+244'  },
  { code: 'AG', name: 'Antigua-et-Barbuda',           dial: '+1268' },
  { code: 'SA', name: 'Arabie saoudite',              dial: '+966'  },
  { code: 'AR', name: 'Argentine',                    dial: '+54'   },
  { code: 'AM', name: 'Arménie',                      dial: '+374'  },
  { code: 'AU', name: 'Australie',                    dial: '+61'   },
  { code: 'AT', name: 'Autriche',                     dial: '+43'   },
  { code: 'AZ', name: 'Azerbaïdjan',                  dial: '+994'  },
  { code: 'BS', name: 'Bahamas',                      dial: '+1242' },
  { code: 'BH', name: 'Bahreïn',                      dial: '+973'  },
  { code: 'BD', name: 'Bangladesh',                   dial: '+880'  },
  { code: 'BB', name: 'Barbade',                      dial: '+1246' },
  { code: 'BE', name: 'Belgique',                     dial: '+32'   },
  { code: 'BZ', name: 'Belize',                       dial: '+501'  },
  { code: 'BJ', name: 'Bénin',                        dial: '+229'  },
  { code: 'BT', name: 'Bhoutan',                      dial: '+975'  },
  { code: 'BY', name: 'Biélorussie',                  dial: '+375'  },
  { code: 'BO', name: 'Bolivie',                      dial: '+591'  },
  { code: 'BA', name: 'Bosnie-Herzégovine',           dial: '+387'  },
  { code: 'BW', name: 'Botswana',                     dial: '+267'  },
  { code: 'BR', name: 'Brésil',                       dial: '+55'   },
  { code: 'BN', name: 'Brunei',                       dial: '+673'  },
  { code: 'BG', name: 'Bulgarie',                     dial: '+359'  },
  { code: 'BF', name: 'Burkina Faso',                 dial: '+226'  },
  { code: 'BI', name: 'Burundi',                      dial: '+257'  },
  { code: 'KH', name: 'Cambodge',                     dial: '+855'  },
  { code: 'CM', name: 'Cameroun',                     dial: '+237'  },
  { code: 'CA', name: 'Canada',                       dial: '+1'    },
  { code: 'CV', name: 'Cap-Vert',                     dial: '+238'  },
  { code: 'CF', name: 'Centrafrique',                 dial: '+236'  },
  { code: 'CL', name: 'Chili',                        dial: '+56'   },
  { code: 'CN', name: 'Chine',                        dial: '+86'   },
  { code: 'CY', name: 'Chypre',                       dial: '+357'  },
  { code: 'CO', name: 'Colombie',                     dial: '+57'   },
  { code: 'KM', name: 'Comores',                      dial: '+269'  },
  { code: 'CG', name: 'Congo',                        dial: '+242'  },
  { code: 'CD', name: 'Congo (RDC)',                  dial: '+243'  },
  { code: 'KP', name: 'Corée du Nord',                dial: '+850'  },
  { code: 'KR', name: 'Corée du Sud',                 dial: '+82'   },
  { code: 'CR', name: 'Costa Rica',                   dial: '+506'  },
  { code: 'CI', name: "Côte d'Ivoire",                dial: '+225'  },
  { code: 'HR', name: 'Croatie',                      dial: '+385'  },
  { code: 'CU', name: 'Cuba',                         dial: '+53'   },
  { code: 'DK', name: 'Danemark',                     dial: '+45'   },
  { code: 'DJ', name: 'Djibouti',                     dial: '+253'  },
  { code: 'DM', name: 'Dominique',                    dial: '+1767' },
  { code: 'EG', name: 'Égypte',                       dial: '+20'   },
  { code: 'AE', name: 'Émirats arabes unis',          dial: '+971'  },
  { code: 'EC', name: 'Équateur',                     dial: '+593'  },
  { code: 'ER', name: 'Érythrée',                     dial: '+291'  },
  { code: 'ES', name: 'Espagne',                      dial: '+34'   },
  { code: 'EE', name: 'Estonie',                      dial: '+372'  },
  { code: 'SZ', name: 'Eswatini',                     dial: '+268'  },
  { code: 'US', name: 'États-Unis',                   dial: '+1'    },
  { code: 'ET', name: 'Éthiopie',                     dial: '+251'  },
  { code: 'FJ', name: 'Fidji',                        dial: '+679'  },
  { code: 'FI', name: 'Finlande',                     dial: '+358'  },
  { code: 'GA', name: 'Gabon',                        dial: '+241'  },
  { code: 'GM', name: 'Gambie',                       dial: '+220'  },
  { code: 'GE', name: 'Géorgie',                      dial: '+995'  },
  { code: 'GH', name: 'Ghana',                        dial: '+233'  },
  { code: 'GR', name: 'Grèce',                        dial: '+30'   },
  { code: 'GD', name: 'Grenade',                      dial: '+1473' },
  { code: 'GP', name: 'Guadeloupe',                   dial: '+590'  },
  { code: 'GU', name: 'Guam',                         dial: '+1671' },
  { code: 'GT', name: 'Guatemala',                    dial: '+502'  },
  { code: 'GN', name: 'Guinée',                       dial: '+224'  },
  { code: 'GQ', name: 'Guinée équatoriale',           dial: '+240'  },
  { code: 'GW', name: 'Guinée-Bissau',                dial: '+245'  },
  { code: 'GY', name: 'Guyana',                       dial: '+592'  },
  { code: 'GF', name: 'Guyane française',             dial: '+594'  },
  { code: 'HT', name: 'Haïti',                        dial: '+509'  },
  { code: 'HN', name: 'Honduras',                     dial: '+504'  },
  { code: 'HK', name: 'Hong Kong',                    dial: '+852'  },
  { code: 'HU', name: 'Hongrie',                      dial: '+36'   },
  { code: 'CK', name: 'Îles Cook',                    dial: '+682'  },
  { code: 'MH', name: 'Îles Marshall',                dial: '+692'  },
  { code: 'MP', name: 'Îles Mariannes du Nord',       dial: '+1670' },
  { code: 'SB', name: 'Îles Salomon',                 dial: '+677'  },
  { code: 'VI', name: 'Îles Vierges américaines',     dial: '+1340' },
  { code: 'IN', name: 'Inde',                         dial: '+91'   },
  { code: 'ID', name: 'Indonésie',                    dial: '+62'   },
  { code: 'IQ', name: 'Irak',                         dial: '+964'  },
  { code: 'IR', name: 'Iran',                         dial: '+98'   },
  { code: 'IE', name: 'Irlande',                      dial: '+353'  },
  { code: 'IS', name: 'Islande',                      dial: '+354'  },
  { code: 'IL', name: 'Israël',                       dial: '+972'  },
  { code: 'IT', name: 'Italie',                       dial: '+39'   },
  { code: 'JM', name: 'Jamaïque',                     dial: '+1876' },
  { code: 'JP', name: 'Japon',                        dial: '+81'   },
  { code: 'JO', name: 'Jordanie',                     dial: '+962'  },
  { code: 'KZ', name: 'Kazakhstan',                   dial: '+7'    },
  { code: 'KE', name: 'Kenya',                        dial: '+254'  },
  { code: 'KG', name: 'Kirghizstan',                  dial: '+996'  },
  { code: 'KI', name: 'Kiribati',                     dial: '+686'  },
  { code: 'KW', name: 'Koweït',                       dial: '+965'  },
  { code: 'LA', name: 'Laos',                         dial: '+856'  },
  { code: 'RE', name: 'La Réunion',                   dial: '+262'  },
  { code: 'LS', name: 'Lesotho',                      dial: '+266'  },
  { code: 'LV', name: 'Lettonie',                     dial: '+371'  },
  { code: 'LB', name: 'Liban',                        dial: '+961'  },
  { code: 'LR', name: 'Libéria',                      dial: '+231'  },
  { code: 'LY', name: 'Libye',                        dial: '+218'  },
  { code: 'LI', name: 'Liechtenstein',                dial: '+423'  },
  { code: 'LT', name: 'Lituanie',                     dial: '+370'  },
  { code: 'LU', name: 'Luxembourg',                   dial: '+352'  },
  { code: 'MO', name: 'Macao',                        dial: '+853'  },
  { code: 'MK', name: 'Macédoine du Nord',            dial: '+389'  },
  { code: 'MG', name: 'Madagascar',                   dial: '+261'  },
  { code: 'MY', name: 'Malaisie',                     dial: '+60'   },
  { code: 'MW', name: 'Malawi',                       dial: '+265'  },
  { code: 'MV', name: 'Maldives',                     dial: '+960'  },
  { code: 'ML', name: 'Mali',                         dial: '+223'  },
  { code: 'MT', name: 'Malte',                        dial: '+356'  },
  { code: 'MA', name: 'Maroc',                        dial: '+212'  },
  { code: 'MQ', name: 'Martinique',                   dial: '+596'  },
  { code: 'MU', name: 'Maurice',                      dial: '+230'  },
  { code: 'MR', name: 'Mauritanie',                   dial: '+222'  },
  { code: 'YT', name: 'Mayotte',                      dial: '+262'  },
  { code: 'MX', name: 'Mexique',                      dial: '+52'   },
  { code: 'FM', name: 'Micronésie',                   dial: '+691'  },
  { code: 'MD', name: 'Moldavie',                     dial: '+373'  },
  { code: 'MC', name: 'Monaco',                       dial: '+377'  },
  { code: 'MN', name: 'Mongolie',                     dial: '+976'  },
  { code: 'ME', name: 'Monténégro',                   dial: '+382'  },
  { code: 'MZ', name: 'Mozambique',                   dial: '+258'  },
  { code: 'MM', name: 'Myanmar',                      dial: '+95'   },
  { code: 'NA', name: 'Namibie',                      dial: '+264'  },
  { code: 'NR', name: 'Nauru',                        dial: '+674'  },
  { code: 'NP', name: 'Népal',                        dial: '+977'  },
  { code: 'NI', name: 'Nicaragua',                    dial: '+505'  },
  { code: 'NE', name: 'Niger',                        dial: '+227'  },
  { code: 'NG', name: 'Nigéria',                      dial: '+234'  },
  { code: 'NU', name: 'Niue',                         dial: '+683'  },
  { code: 'NC', name: 'Nouvelle-Calédonie',           dial: '+687'  },
  { code: 'NZ', name: 'Nouvelle-Zélande',             dial: '+64'   },
  { code: 'NO', name: 'Norvège',                      dial: '+47'   },
  { code: 'OM', name: 'Oman',                         dial: '+968'  },
  { code: 'UG', name: 'Ouganda',                      dial: '+256'  },
  { code: 'UZ', name: 'Ouzbékistan',                  dial: '+998'  },
  { code: 'PK', name: 'Pakistan',                     dial: '+92'   },
  { code: 'PW', name: 'Palaos',                       dial: '+680'  },
  { code: 'PS', name: 'Palestine',                    dial: '+970'  },
  { code: 'PA', name: 'Panama',                       dial: '+507'  },
  { code: 'PG', name: 'Papouasie-Nvl.-Guinée',        dial: '+675'  },
  { code: 'PY', name: 'Paraguay',                     dial: '+595'  },
  { code: 'NL', name: 'Pays-Bas',                     dial: '+31'   },
  { code: 'PE', name: 'Pérou',                        dial: '+51'   },
  { code: 'PH', name: 'Philippines',                  dial: '+63'   },
  { code: 'PL', name: 'Pologne',                      dial: '+48'   },
  { code: 'PF', name: 'Polynésie française',          dial: '+689'  },
  { code: 'PR', name: 'Porto Rico',                   dial: '+1787' },
  { code: 'PT', name: 'Portugal',                     dial: '+351'  },
  { code: 'QA', name: 'Qatar',                        dial: '+974'  },
  { code: 'RO', name: 'Roumanie',                     dial: '+40'   },
  { code: 'GB', name: 'Royaume-Uni',                  dial: '+44'   },
  { code: 'RU', name: 'Russie',                       dial: '+7'    },
  { code: 'RW', name: 'Rwanda',                       dial: '+250'  },
  { code: 'BL', name: 'Saint-Barthélemy',             dial: '+590'  },
  { code: 'KN', name: 'Saint-Kitts-et-Nevis',         dial: '+1869' },
  { code: 'SM', name: 'Saint-Marin',                  dial: '+378'  },
  { code: 'MF', name: 'Saint-Martin',                 dial: '+590'  },
  { code: 'PM', name: 'Saint-Pierre-et-Miquelon',     dial: '+508'  },
  { code: 'VC', name: 'Saint-Vincent',                dial: '+1784' },
  { code: 'LC', name: 'Sainte-Lucie',                 dial: '+1758' },
  { code: 'WS', name: 'Samoa',                        dial: '+685'  },
  { code: 'AS', name: 'Samoa américaines',            dial: '+1684' },
  { code: 'ST', name: 'São Tomé-et-Príncipe',         dial: '+239'  },
  { code: 'SN', name: 'Sénégal',                      dial: '+221'  },
  { code: 'RS', name: 'Serbie',                       dial: '+381'  },
  { code: 'SC', name: 'Seychelles',                   dial: '+248'  },
  { code: 'SL', name: 'Sierra Leone',                 dial: '+232'  },
  { code: 'SG', name: 'Singapour',                    dial: '+65'   },
  { code: 'SK', name: 'Slovaquie',                    dial: '+421'  },
  { code: 'SI', name: 'Slovénie',                     dial: '+386'  },
  { code: 'SO', name: 'Somalie',                      dial: '+252'  },
  { code: 'SD', name: 'Soudan',                       dial: '+249'  },
  { code: 'SS', name: 'Soudan du Sud',                dial: '+211'  },
  { code: 'LK', name: 'Sri Lanka',                    dial: '+94'   },
  { code: 'SR', name: 'Suriname',                     dial: '+597'  },
  { code: 'SE', name: 'Suède',                        dial: '+46'   },
  { code: 'CH', name: 'Suisse',                       dial: '+41'   },
  { code: 'SY', name: 'Syrie',                        dial: '+963'  },
  { code: 'TW', name: 'Taïwan',                       dial: '+886'  },
  { code: 'TJ', name: 'Tadjikistan',                  dial: '+992'  },
  { code: 'TZ', name: 'Tanzanie',                     dial: '+255'  },
  { code: 'TD', name: 'Tchad',                        dial: '+235'  },
  { code: 'CZ', name: 'Tchéquie',                     dial: '+420'  },
  { code: 'TH', name: 'Thaïlande',                    dial: '+66'   },
  { code: 'TL', name: 'Timor oriental',               dial: '+670'  },
  { code: 'TG', name: 'Togo',                         dial: '+228'  },
  { code: 'TK', name: 'Tokelau',                      dial: '+690'  },
  { code: 'TO', name: 'Tonga',                        dial: '+676'  },
  { code: 'TT', name: 'Trinité-et-Tobago',            dial: '+1868' },
  { code: 'TN', name: 'Tunisie',                      dial: '+216'  },
  { code: 'TM', name: 'Turkménistan',                 dial: '+993'  },
  { code: 'TR', name: 'Turquie',                      dial: '+90'   },
  { code: 'TV', name: 'Tuvalu',                       dial: '+688'  },
  { code: 'UA', name: 'Ukraine',                      dial: '+380'  },
  { code: 'UY', name: 'Uruguay',                      dial: '+598'  },
  { code: 'VU', name: 'Vanuatu',                      dial: '+678'  },
  { code: 'VE', name: 'Venezuela',                    dial: '+58'   },
  { code: 'VN', name: 'Viêt Nam',                     dial: '+84'   },
  { code: 'WF', name: 'Wallis-et-Futuna',             dial: '+681'  },
  { code: 'YE', name: 'Yémen',                        dial: '+967'  },
  { code: 'ZM', name: 'Zambie',                       dial: '+260'  },
  { code: 'ZW', name: 'Zimbabwe',                     dial: '+263'  },
]

export function PhoneInput({
  defaultCountry = 'FR',
  onChange,
  placeholder = '06 00 00 00 00',
  className = '',
  inputId,
}) {
  const [country, setCountry] = useState(
    () => COUNTRIES.find(c => c.code === defaultCountry) ?? COUNTRIES[0]
  )
  const [number,  setNumber]  = useState('')
  const [open,    setOpen]    = useState(false)
  const [search,  setSearch]  = useState('')
  const [pos,     setPos]     = useState({ top: 0, left: 0, width: 300 })

  const triggerRef = useRef(null)
  const dropRef    = useRef(null)
  const searchRef  = useRef(null)

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search.replace(/\s/g, ''))
      )
    : COUNTRIES

  const openDropdown = () => {
    const rect       = triggerRef.current.getBoundingClientRect()
    const dropW      = Math.min(window.innerWidth - 16, Math.max(rect.width + 200, 300))
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const dropH      = Math.min(360, window.innerHeight * 0.5)
    const top = spaceBelow >= Math.min(dropH, 200) || spaceBelow >= spaceAbove
      ? rect.bottom + 4
      : rect.top - dropH - 4
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8))
    setPos({ top, left, width: dropW })
    setOpen(true)
    setTimeout(() => searchRef.current?.focus(), 40)
  }

  const close = () => { setOpen(false); setSearch('') }

  const select = c => {
    setCountry(c)
    onChange?.(`${c.dial} ${number}`.trim())
    close()
  }

  const handleNumber = e => {
    const val = e.target.value
    setNumber(val)
    onChange?.(`${country.dial} ${val}`.trim())
  }

  useEffect(() => {
    if (!open) return
    const h = e => {
      if (triggerRef.current?.contains(e.target) || dropRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('touchstart', h)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  const flagUrl = code => `https://flagcdn.com/w40/${code.toLowerCase()}.png`

  return (
    <div className={`${s.wrap} ${className}`}>
      {/* ── Sélecteur pays ── */}
      <button
        ref={triggerRef}
        type="button"
        className={`${s.trigger} ${open ? s.triggerOpen : ''}`}
        onClick={() => open ? close() : openDropdown()}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Pays : ${country.name}, indicatif ${country.dial}`}
      >
        <img
          src={flagUrl(country.code)}
          alt={country.name}
          className={s.flag}
          width={24}
          height={16}
          loading="eager"
        />
        <span className={s.triggerCode}>{country.code}</span>
        <span className={s.triggerDial}>{country.dial}</span>
        <span className={s.caret} aria-hidden="true">▾</span>
      </button>

      {/* ── Saisie numéro ── */}
      <input
        id={inputId}
        type="tel"
        className={s.input}
        value={number}
        placeholder={placeholder}
        onChange={handleNumber}
        autoComplete="tel-national"
      />

      {/* ── Dropdown (portal) ── */}
      {open && createPortal(
        <div
          ref={dropRef}
          className={s.dropdown}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          role="listbox"
          aria-label="Sélectionner un pays"
        >
          <div className={s.searchWrap}>
            <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" width="14" height="14" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              type="text"
              className={s.search}
              placeholder="Rechercher un pays…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Rechercher un pays"
            />
            {search && (
              <button
                type="button"
                className={s.searchClear}
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
              >✕</button>
            )}
          </div>

          <ul className={s.list}>
            {filtered.length === 0 ? (
              <li className={s.empty}>Aucun résultat</li>
            ) : filtered.map(c => (
              <li key={c.code} role="option" aria-selected={c.code === country.code}>
                <button
                  type="button"
                  className={`${s.option} ${c.code === country.code ? s.optionOn : ''}`}
                  onClick={() => select(c)}
                >
                  <img
                    src={flagUrl(c.code)}
                    alt=""
                    className={s.flagSm}
                    width={24}
                    height={16}
                    loading="lazy"
                  />
                  <span className={s.isoCode}>{c.code}</span>
                  <span className={s.countryName}>{c.name}</span>
                  <span className={s.dialCode}>{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
