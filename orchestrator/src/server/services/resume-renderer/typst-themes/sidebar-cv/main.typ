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
  link-or-text(upper(label), text-of-item(entry, "url"))
}

#let bullets-of(entry) = {
  list-of(entry.at("bullets", default: ()))
    .map(item => text-of(item))
    .filter(item => item != "")
}

// ---------------------------------------------------------------------------
// Colours & metrics
// ---------------------------------------------------------------------------

#let accent = __PRIMARY_COLOR__
#let sidebar-bg = __SIDEBAR_BG_COLOR__
// Fixed absolute width (≈ 30 % of A4 210 mm); page margins require absolute lengths.
#let sidebar-col-width = 63mm

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

// ---------------------------------------------------------------------------
// Sidebar section helper
// ---------------------------------------------------------------------------

#let sidebar-section(title, body) = {
  v(14pt)
  align(center)[
    #text(weight: "bold", size: 12pt, tracking: 2pt)[#upper(title)]
  ]
  v(3pt)
  align(center)[#line(length: 50%, stroke: 0.5pt + luma(140))]
  v(6pt)
  body
}

// ---------------------------------------------------------------------------
// Sidebar content
// ---------------------------------------------------------------------------

#let sidebar-content = {
  set text(size: 9pt)
  set align(center)

  // Name — split first/last on separate lines with wide tracking
  v(20pt)
  {
    let name = text-of(source.at("name", default: ""))
    let name-parts = name.split(" ")
    let first-name = name-parts.at(0, default: "")
    let last-name = name-parts.slice(1).join(" ")
    text(font: __HEADING_FONT__, size: 26pt, weight: "regular", tracking: 8pt, fill: accent)[#upper(first-name)]
    if last-name != "" {
      v(4pt)
      text(font: __HEADING_FONT__, size: 26pt, weight: "regular", tracking: 8pt, fill: accent)[#upper(last-name)]
    }
  }
  v(16pt)

  // Photo (circular crop) — only shown when a picture is available
  if picture-path != "" and picture-hidden == false {
    let img-size = calc.max(80, calc.min(picture-size, 160)) * 1pt
    box(
      clip: true,
      radius: 50%,
      width: img-size,
      height: img-size,
      image(picture-path, width: img-size),
    )
    v(14pt)
  }

  // Headline / tagline
  {
    let headline = text-of(source.at("headline", default: ""))
    if headline != "" {
      v(6pt)
      text(style: "italic", size: 12pt, weight: "bold")[#headline]
      v(4pt)
    }
  }

  // Education — show degree(s) as a brief tagline under the headline
  {
    let education = list-of(source.at("education", default: ()))
    for entry in education {
      let degree = text-of-item(entry, "subtitle")
      if degree != "" {
        text(style: "italic", size: 10pt)[#degree]
        v(2pt)
      }
    }
  }

  // Profile / Summary
  {
    let summary-text = text-of(source.at("summary", default: ""))
    if summary-text != "" {
      sidebar-section(
        text-of(section-titles.at("summary", default: "Profile")),
        {
          set align(center)
          set text(size: 8.5pt)
          set par(leading: 0.6em)
          text(style: "italic")[#summary-text]
        },
      )
    }
  }

  // Skills
  {
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
  }

  // Languages
  {
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
  }

  // Interests
  {
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
  }

  // Contact
  sidebar-section(
    text-of(section-titles.at("contact", default: "Contact")),
    {
      set align(center)
      set text(size: 8.5pt)
      let location = text-of(source.at("location", default: ""))
      if location != "" {
        // Show full name at top of contact block
        let name-val = text-of(source.at("name", default: ""))
        if name-val != "" {
          text(weight: "bold")[#name-val]
          linebreak()
        }
        text[#location]
        linebreak()
        v(4pt)
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
// Page setup — sidebar drawn via background so main content flows across pages
// (defined after sidebar-content so the binding is in scope in the background closure)
// ---------------------------------------------------------------------------

#set page(
  paper: "a4",
  // Left margin reserves space for the sidebar column; right margin gives breathing room.
  margin: (top: 0pt, bottom: 0pt, left: sidebar-col-width, right: 1.5cm),
  fill: __BACKGROUND_COLOR__,
  background: context {
    // Tinted sidebar background appears on every page.
    place(left + top,
      rect(width: sidebar-col-width, height: 100%, fill: sidebar-bg, stroke: none)
    )
    // Sidebar content (name, photo, summary, contact…) only on the first page.
    if here().page() == 1 {
      place(left + top,
        box(width: sidebar-col-width, inset: (x: 16pt, y: 0pt))[
          #set text(font: __BODY_FONT__, size: 9pt, lang: "en", fill: __TEXT_COLOR__)
          #set par(leading: 0.55em)
          #show link: set text(fill: accent)
          #sidebar-content
        ]
      )
    }
  },
)
#set text(font: __BODY_FONT__, size: 10pt, lang: "en", fill: __TEXT_COLOR__)
#set par(leading: 0.55em)
#show link: set text(fill: accent)

// ---------------------------------------------------------------------------
// Main-area section heading
// ---------------------------------------------------------------------------

#let main-section(title) = {
  v(6pt)
  text(size: 16pt, weight: "bold", fill: accent, tracking: 2pt)[#upper(title)]
  v(-2pt)
  line(length: 100%, stroke: 0.6pt + accent)
  v(6pt)
}

// ---------------------------------------------------------------------------
// Experience / timeline entry in main area
// ---------------------------------------------------------------------------

#let main-entry(title, subtitle: "", date: "", location: "", body-content: []) = {
  text(size: 11pt, weight: "bold")[#title]
  if subtitle != "" {
    text(size: 11pt, weight: "bold")[ | ]
    text(size: 11pt, weight: "bold")[#upper(subtitle)]
  }
  linebreak()
  if date != "" or location != "" {
    set text(size: 8.5pt)
    smallcaps(upper((date, location).filter(x => x != "").join(", ")))
    linebreak()
  }
  v(3pt)
  set text(size: 9.5pt)
  body-content
  v(8pt)
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

#let main-content = {
  set text(size: 10pt)

  // Professional Experience
  {
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
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in entry-bullets {
              par[#b]
            }
          },
        )
      }
    }
  }

  // Education (full entries in main area)
  {
    let education = list-of(source.at("education", default: ()))
    if education.len() > 0 {
      main-section(text-of(section-titles.at("education", default: "Education")))
      for entry in education {
        let title-text = linked-entry-label(entry, text-of-item(entry, "title"))
        let sub = text-of-item(entry, "subtitle")
        let date = text-of-item(entry, "date")
        let loc = text-of-item(entry, "secondarySubtitle")
        main-entry(
          title-text,
          subtitle: sub,
          date: date,
          location: loc,
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) {
              par[#b]
            }
          },
        )
      }
    }
  }

  // Projects
  {
    let projects = list-of(source.at("projects", default: ()))
    if projects.len() > 0 {
      main-section(text-of(section-titles.at("projects", default: "Projects")))
      for entry in projects {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          date: text-of-item(entry, "date"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
    }
  }

  // Awards
  {
    let awards = list-of(source.at("awards", default: ()))
    if awards.len() > 0 {
      main-section(text-of(section-titles.at("awards", default: "Awards")))
      for entry in awards {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          date: text-of-item(entry, "date"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
    }
  }

  // Certifications
  {
    let certifications = list-of(source.at("certifications", default: ()))
    if certifications.len() > 0 {
      main-section(text-of(section-titles.at("certifications", default: "Certifications")))
      for entry in certifications {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          date: text-of-item(entry, "date"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
    }
  }

  // Publications
  {
    let publications = list-of(source.at("publications", default: ()))
    if publications.len() > 0 {
      main-section(text-of(section-titles.at("publications", default: "Publications")))
      for entry in publications {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          date: text-of-item(entry, "date"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
    }
  }

  // Volunteer
  {
    let volunteer = list-of(source.at("volunteer", default: ()))
    if volunteer.len() > 0 {
      main-section(text-of(section-titles.at("volunteer", default: "Volunteer")))
      for entry in volunteer {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          date: text-of-item(entry, "date"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
    }
  }

  // References
  {
    let references = list-of(source.at("references", default: ()))
    if references.len() > 0 {
      main-section(text-of(section-titles.at("references", default: "References")))
      for entry in references {
        main-entry(
          linked-entry-label(entry, text-of-item(entry, "title")),
          subtitle: text-of-item(entry, "subtitle"),
          body-content: {
            set par(leading: 0.55em, first-line-indent: 14pt, spacing: 0.7em)
            for b in bullets-of(entry) { par[#b] }
          },
        )
      }
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
// Page layout — sidebar is drawn via page background; main content flows
// naturally across as many pages as needed.
// ---------------------------------------------------------------------------

#pad(x: 24pt, top: 20pt, bottom: 20pt)[
  #main-content
]
