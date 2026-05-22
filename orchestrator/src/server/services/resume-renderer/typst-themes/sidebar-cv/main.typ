// Sidebar CV — two-column layout inspired by the "Tamay Gündüz" CV style.
// Left sidebar (tinted) holds photo, headline, summary, and contact.
// Right main area holds professional experience and remaining sections.

#let source = json(__RESUME_DATA_PATH__)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

#let with-default(value, fallback) = {
  if value == none { fallback } else { value }
}

#let text-of(value) = with-default(value, "")
#let list-of(value) = with-default(value, ())

#let text-of-item(item, key) = text-of(item.at(key, default: ""))

#let link-or-text(label, url) = {
  if url == "" { label } else { link(url)[#label] }
}

#let linked-entry-label(entry, label) = {
  link-or-text(label, text-of-item(entry, "url"))
}

#let bullets-of(entry) = {
  list-of(entry.at("bullets", default: ()))
    .map(item => text-of(item))
    .filter(item => item != "")
}

// ---------------------------------------------------------------------------
// Colours & metrics
// ---------------------------------------------------------------------------

#let accent = rgb("#4a7c8f")
#let sidebar-bg = rgb("#e8ecee")
#let sidebar-width = 30%
#let main-width = 70%

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

#set page(
  paper: "a4",
  margin: (top: 0pt, bottom: 0pt, left: 0pt, right: 0pt),
)
#set text(font: "Libertinus Serif", size: 10pt, lang: "en")
#set par(leading: 0.55em)
#show link: set text(fill: accent)

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

#let picture = with-default(source.at("picture", default: (:)), (:))
#let picture-path = text-of(picture.at("renderPath", default: ""))
#let picture-hidden = with-default(picture.at("hidden", default: true), true)
#let picture-size = with-default(picture.at("size", default: 96), 96)
#let section-titles = with-default(source.at("sectionTitles", default: (:)), (:))

#let contact-items = list-of(source.at("contactItems", default: ()))
#let profile-items = list-of(source.at("profileItems", default: ()))
#let custom-field-items = list-of(source.at("customFieldItems", default: ()))

#let is-email(item) = {
  let t = text-of-item(item, "text")
  let u = text-of-item(item, "url")
  t.contains("@") or u.starts-with("mailto:")
}
#let is-phone(item) = {
  text-of-item(item, "url") == "" and not is-email(item)
}

// ---------------------------------------------------------------------------
// Sidebar section helper
// ---------------------------------------------------------------------------

#let sidebar-section(title, body) = {
  v(10pt)
  align(center)[
    #text(weight: "bold", size: 11pt, tracking: 1.5pt)[#upper(title)]
  ]
  v(4pt)
  line(length: 60%, stroke: 0.4pt + accent)
  v(4pt)
  body
}

// ---------------------------------------------------------------------------
// Sidebar content
// ---------------------------------------------------------------------------

#let sidebar-content = {
  set text(size: 9pt)
  set align(center)

  // Name
  v(22pt)
  text(size: 22pt, weight: "bold", tracking: 3pt)[
    #upper(text-of(source.at("name", default: "")))
  ]
  v(10pt)

  // Photo
  if picture-path != "" and picture-hidden == false {
    let img-size = calc.max(48, calc.min(picture-size, 140)) * 1pt
    box(
      clip: true,
      radius: 50%,
      width: img-size,
      height: img-size,
      image(picture-path, width: img-size),
    )
    v(8pt)
  }

  // Headline / tagline
  let headline = text-of(source.at("headline", default: ""))
  if headline != "" {
    text(style: "italic", size: 10pt)[#headline]
    v(2pt)
  }

  // Education — show degree(s) as a brief tagline under the headline
  let education = list-of(source.at("education", default: ()))
  for entry in education {
    let degree = text-of-item(entry, "subtitle")
    if degree != "" {
      text(style: "italic", size: 9pt)[#degree]
      v(2pt)
    }
  }

  // Profile / Summary
  let summary-text = text-of(source.at("summary", default: ""))
  if summary-text != "" {
    sidebar-section(
      text-of(section-titles.at("summary", default: "Profile")),
      {
        set align(center)
        set text(size: 8.5pt)
        text(style: "italic")[#summary-text]
      },
    )
  }

  // Skills
  let skill-groups = list-of(source.at("skillGroups", default: ()))
  if skill-groups.len() > 0 {
    sidebar-section(
      text-of(section-titles.at("skills", default: "Skills")),
      {
        set align(left)
        set text(size: 8.5pt)
        for group in skill-groups {
          text(weight: "bold")[#text-of-item(group, "name")]
          linebreak()
          let kws = list-of(group.at("keywords", default: ()))
          text[#kws.join(", ")]
          v(4pt)
        }
      },
    )
  }

  // Languages
  let languages = list-of(source.at("languages", default: ()))
  if languages.len() > 0 {
    sidebar-section(
      text-of(section-titles.at("languages", default: "Languages")),
      {
        set align(left)
        set text(size: 8.5pt)
        for item in languages {
          let fluency = text-of-item(item, "fluency")
          if fluency != "" {
            [*#text-of-item(item, "language"):* #fluency]
          } else {
            [*#text-of-item(item, "language")*]
          }
          linebreak()
        }
      },
    )
  }

  // Interests
  let interests = list-of(source.at("interests", default: ()))
  if interests.len() > 0 {
    sidebar-section(
      text-of(section-titles.at("interests", default: "Interests")),
      {
        set align(left)
        set text(size: 8.5pt)
        for item in interests {
          let kws = list-of(item.at("keywords", default: ()))
          if kws.len() > 0 {
            [*#text-of-item(item, "name"):* #kws.join(", ")]
          } else {
            [*#text-of-item(item, "name")*]
          }
          linebreak()
        }
      },
    )
  }

  // Contact
  sidebar-section(
    text-of(section-titles.at("contact", default: "Contact")),
    {
      set align(center)
      set text(size: 8.5pt)
      let location = text-of(source.at("location", default: ""))
      if location != "" {
        text[#location]
        linebreak()
        v(2pt)
      }
      for item in contact-items {
        link-or-text(text-of-item(item, "text"), text-of-item(item, "url"))
        linebreak()
      }
    },
  )

  // Profiles
  if profile-items.len() > 0 {
    sidebar-section(
      text-of(section-titles.at("profiles", default: "Profiles")),
      {
        set align(left)
        set text(size: 8.5pt)
        for item in profile-items {
          let lbl = text-of-item(item, "username")
          let network = text-of-item(item, "network")
          let url = text-of-item(item, "url")
          let display = if lbl != "" { lbl } else if network != "" { network } else { url }
          [*#network:* ]
          link-or-text(display, url)
          linebreak()
        }
      },
    )
  }
}

// ---------------------------------------------------------------------------
// Main-area section heading
// ---------------------------------------------------------------------------

#let main-section(title) = {
  v(8pt)
  text(size: 14pt, weight: "bold", fill: accent, tracking: 0.5pt)[#upper(title)]
  v(-1pt)
  line(length: 100%, stroke: 0.5pt + accent)
  v(4pt)
}

// ---------------------------------------------------------------------------
// Experience / timeline entry in main area
// ---------------------------------------------------------------------------

#let main-entry(title, subtitle: "", date: "", location: "", body-content: []) = {
  text(size: 12pt, weight: "bold")[#upper(title)]
  if subtitle != "" {
    [ | ]
    text(size: 12pt, weight: "bold")[#upper(subtitle)]
  }
  linebreak()
  if date != "" or location != "" {
    text(size: 9pt, tracking: 0.5pt)[
      #upper(
        (date, location).filter(x => x != "").join(", "),
      )
    ]
    linebreak()
  }
  v(2pt)
  set text(size: 9.5pt)
  body-content
  v(6pt)
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

#let main-content = {
  set text(size: 10pt)

  // Professional Experience
  let experience = list-of(source.at("experience", default: ()))
  if experience.len() > 0 {
    main-section(text-of(section-titles.at("experience", default: "Professional Experience")))
    for entry in experience {
      let title-text = linked-entry-label(entry, text-of-item(entry, "title"))
      let sub = text-of-item(entry, "subtitle")
      let date = text-of-item(entry, "date")
      let loc = text-of-item(entry, "secondarySubtitle")
      let entry-bullets = bullets-of(entry)
      main-entry(
        title-text,
        subtitle: sub,
        date: date,
        location: loc,
        body-content: {
          for b in entry-bullets {
            set par(leading: 0.5em, first-line-indent: 12pt)
            text[#b]
            linebreak()
            v(2pt)
          }
        },
      )
    }
  }

  // Education (full entries in main area)
  let education = list-of(source.at("education", default: ()))
  if education.len() > 0 {
    main-section(text-of(section-titles.at("education", default: "Education")))
    for entry in education {
      let title-text = linked-entry-label(entry, text-of-item(entry, "title"))
      let sub = text-of-item(entry, "subtitle")
      let date = text-of-item(entry, "date")
      let loc = text-of-item(entry, "secondarySubtitle")
      let entry-bullets = bullets-of(entry)
      main-entry(
        title-text,
        subtitle: sub,
        date: date,
        location: loc,
        body-content: {
          for b in entry-bullets {
            text[#b]
            linebreak()
          }
        },
      )
    }
  }

  // Projects
  let projects = list-of(source.at("projects", default: ()))
  if projects.len() > 0 {
    main-section(text-of(section-titles.at("projects", default: "Projects")))
    for entry in projects {
      let title-text = linked-entry-label(entry, text-of-item(entry, "title"))
      let sub = text-of-item(entry, "subtitle")
      let date = text-of-item(entry, "date")
      let entry-bullets = bullets-of(entry)
      main-entry(
        title-text,
        subtitle: sub,
        date: date,
        body-content: {
          for b in entry-bullets {
            text[#b]
            linebreak()
          }
        },
      )
    }
  }

  // Awards
  let awards = list-of(source.at("awards", default: ()))
  if awards.len() > 0 {
    main-section(text-of(section-titles.at("awards", default: "Awards")))
    for entry in awards {
      main-entry(
        linked-entry-label(entry, text-of-item(entry, "title")),
        subtitle: text-of-item(entry, "subtitle"),
        date: text-of-item(entry, "date"),
        body-content: {
          for b in bullets-of(entry) { text[#b]; linebreak() }
        },
      )
    }
  }

  // Certifications
  let certifications = list-of(source.at("certifications", default: ()))
  if certifications.len() > 0 {
    main-section(text-of(section-titles.at("certifications", default: "Certifications")))
    for entry in certifications {
      main-entry(
        linked-entry-label(entry, text-of-item(entry, "title")),
        subtitle: text-of-item(entry, "subtitle"),
        date: text-of-item(entry, "date"),
        body-content: {
          for b in bullets-of(entry) { text[#b]; linebreak() }
        },
      )
    }
  }

  // Publications
  let publications = list-of(source.at("publications", default: ()))
  if publications.len() > 0 {
    main-section(text-of(section-titles.at("publications", default: "Publications")))
    for entry in publications {
      main-entry(
        linked-entry-label(entry, text-of-item(entry, "title")),
        subtitle: text-of-item(entry, "subtitle"),
        date: text-of-item(entry, "date"),
        body-content: {
          for b in bullets-of(entry) { text[#b]; linebreak() }
        },
      )
    }
  }

  // Volunteer
  let volunteer = list-of(source.at("volunteer", default: ()))
  if volunteer.len() > 0 {
    main-section(text-of(section-titles.at("volunteer", default: "Volunteer")))
    for entry in volunteer {
      main-entry(
        linked-entry-label(entry, text-of-item(entry, "title")),
        subtitle: text-of-item(entry, "subtitle"),
        date: text-of-item(entry, "date"),
        body-content: {
          for b in bullets-of(entry) { text[#b]; linebreak() }
        },
      )
    }
  }

  // References
  let references = list-of(source.at("references", default: ()))
  if references.len() > 0 {
    main-section(text-of(section-titles.at("references", default: "References")))
    for entry in references {
      main-entry(
        linked-entry-label(entry, text-of-item(entry, "title")),
        subtitle: text-of-item(entry, "subtitle"),
        body-content: {
          for b in bullets-of(entry) { text[#b]; linebreak() }
        },
      )
    }
  }

  // Custom fields
  if custom-field-items.len() > 0 {
    main-section(text-of(section-titles.at("customFields", default: "Custom Fields")))
    for item in custom-field-items {
      let title = text-of-item(item, "title")
      let value = text-of-item(item, "text")
      let url = text-of-item(item, "url")
      if title != "" and title != value {
        [*#title:* ]
        link-or-text(value, url)
      } else {
        link-or-text(if title != "" { title } else { value }, url)
      }
      linebreak()
    }
  }
}

// ---------------------------------------------------------------------------
// Page layout — sidebar + main in a two-column grid
// ---------------------------------------------------------------------------

#grid(
  columns: (sidebar-width, main-width),
  // Sidebar column
  rect(
    width: 100%,
    height: 100%,
    fill: sidebar-bg,
    inset: (x: 14pt, y: 0pt),
    stroke: none,
  )[
    #sidebar-content
  ],
  // Main column
  rect(
    width: 100%,
    height: 100%,
    inset: (x: 22pt, y: 18pt),
    stroke: none,
  )[
    #main-content
  ],
)
