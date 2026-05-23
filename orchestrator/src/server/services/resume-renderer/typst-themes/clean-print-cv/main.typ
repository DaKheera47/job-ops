#import "@preview/clean-print-cv:0.1.0": *

#let source = json(__RESUME_DATA_PATH__)

#let with-default(value, fallback) = {
  if value == none {
    fallback
  } else {
    value
  }
}

#let text-of(value) = with-default(value, "")
#let list-of(value) = with-default(value, ())

#let markup-text(val) = {
  if type(val) == str {
    eval(val, mode: "markup")
  } else {
    val
  }
}

#let contact-items = list-of(source.at("contactItems", default: ()))
#let profile-items = list-of(source.at("profileItems", default: ()))
#let custom-field-items = list-of(source.at("customFieldItems", default: ()))

#let text-of-item(item, key) = text-of(item.at(key, default: ""))

#let link-or-text(label, url) = {
  if url == "" {
    label
  } else {
    link(url)[#label]
  }
}

#let linked-entry-label(entry, label) = {
  link-or-text(label, text-of-item(entry, "url"))
}

#let bullets-of(entry) = {
  list-of(entry.at("bullets", default: ()))
    .map(item => text-of(item))
    .filter(item => item != "")
    .map(item => markup-text(item))
}

#let joined-bullets(entry) = {
  bullets-of(entry)
    .join(" • ")
}

#let bullet-trailing(entry) = {
  let bullets = bullets-of(entry)
  if bullets.len() == 0 {
    []
  } else [
    #set text(size: 9pt)
    #for item in bullets [
      - #item
    ]
  ]
}

#let contact-matching(predicate) = {
  let matches = contact-items.filter(predicate)
  if matches.len() > 0 {
    matches.at(0)
  } else {
    none
  }
}

#let profile-matching(predicate) = {
  let matches = profile-items.filter(predicate)
  if matches.len() > 0 {
    matches.at(0)
  } else {
    none
  }
}

#let contact-label-matching(predicate) = {
  let item = contact-matching(predicate)
  if item == none {
    []
  } else {
    link-or-text(text-of-item(item, "text"), text-of-item(item, "url"))
  }
}

#let profile-label-matching(predicate) = {
  let item = profile-matching(predicate)
  if item == none {
    []
  } else {
    let label = text-of-item(item, "username")
    let network = text-of-item(item, "network")
    let url = text-of-item(item, "url")
    let text = if label != "" { label } else if network != "" { network } else { url }
    link-or-text(text, url)
  }
}

#let is-email(item) = {
  let text = text-of-item(item, "text")
  let url = text-of-item(item, "url")
  text.contains("@") or url.starts-with("mailto:")
}

#let is-website-contact(item) = {
  let url = text-of-item(item, "url")
  url != "" and not is-email(item)
}

#let is-linkedin-profile(item) = {
  let network = text-of-item(item, "network")
  let url = text-of-item(item, "url")
  network.contains("LinkedIn") or network.contains("linkedin") or url.contains("linkedin")
}

#let is-github-profile(item) = {
  let network = text-of-item(item, "network")
  let url = text-of-item(item, "url")
  network.contains("GitHub") or network.contains("Github") or network.contains("github") or url.contains("github")
}

#let is-website-profile(item) = {
  let url = text-of-item(item, "url")
  url != "" and not is-linkedin-profile(item) and not is-github-profile(item)
}

#let is-phone(item) = {
  text-of-item(item, "url") == "" and not is-email(item)
}

#let extra-section(title, entries) = {
  if entries.len() == 0 {
    []
  } else [
    #v(1.05em)
    #text(weight: "bold", size: 1.05em)[#title]
    #v(0.35em)
    #for entry in entries [
      #entry
      #v(0.45em)
    ]
  ]
}

#let line-entry(label, value) = [
  #text(weight: "bold")[#label]
  #h(4pt)
  #value
]

#let timeline-entry(title, subtitle: "", date: "", details: "", trailing: []) = [
  #grid(
    columns: (1fr, auto),
    column-gutter: 1em,
    [#text(weight: "bold")[#title]],
    [#text(size: 9pt)[#date]],
  )
  #if subtitle != "" [
    #emph[#subtitle]
  ]
  #if details != "" [
    #text(size: 9pt)[#details]
  ]
  #if trailing != [] [
    #trailing
  ]
]

#let picture = with-default(source.at("picture", default: (:)), (:))
#let picture-path = text-of(picture.at("renderPath", default: ""))
#let picture-hidden = with-default(picture.at("hidden", default: true), true)
#let picture-size = with-default(picture.at("size", default: 80), 80)
#let section-titles = with-default(source.at("sectionTitles", default: (:)), (:))

#let data = (
  personal: (
    name: text-of(source.at("name", default: "")),
    title: text-of(source.at("headline", default: "")),
    email: contact-label-matching(is-email),
    phone: contact-label-matching(is-phone),
    location: text-of(source.at("location", default: "")),
    linkedin: profile-label-matching(is-linkedin-profile),
    github: profile-label-matching(is-github-profile),
    website: if profile-matching(is-website-profile) != none {
      profile-label-matching(is-website-profile)
    } else {
      contact-label-matching(is-website-contact)
    },
  ),
  summary: markup-text(text-of(source.at("summary", default: ""))),
  skills: list-of(source.at("skillGroups", default: ())).map(group => (
    category: text-of-item(group, "name"),
    items: list-of(group.at("keywords", default: ())),
  )),
  experience: list-of(source.at("experience", default: ())).map(entry => (
    role: text-of-item(entry, "subtitle"),
    company: linked-entry-label(entry, text-of-item(entry, "title")),
    location: text-of-item(entry, "secondarySubtitle"),
    period: text-of-item(entry, "date"),
    highlights: bullets-of(entry),
  )),
  projects: list-of(source.at("projects", default: ())).map(entry => (
    name: linked-entry-label(entry, text-of-item(entry, "title")),
    url: if text-of-item(entry, "url") == "" {
      []
    } else {
      link(text-of-item(entry, "url"))[#text-of-item(entry, "url")]
    },
    description: joined-bullets(entry),
  )),
  education: list-of(source.at("education", default: ())).map(entry => (
    degree: text-of-item(entry, "subtitle"),
    institution: linked-entry-label(entry, text-of-item(entry, "title")),
    location: text-of-item(entry, "secondarySubtitle"),
    period: text-of-item(entry, "date"),
    details: joined-bullets(entry),
  )),
)

#show: cv-page-setup

#if picture-path != "" and picture-hidden == false {
  align(center)[#image(picture-path, width: picture-size * 1pt)]
  v(6pt)
}

#cv-header(data.personal)

#if data.summary != "" {
  cv-summary(data.summary)
}

#if data.experience.len() > 0 {
  cv-experience(data.experience)
}

#if data.skills.len() > 0 {
  cv-skills(data.skills)
}

#if data.projects.len() > 0 {
  cv-projects(data.projects)
}

#if data.education.len() > 0 {
  cv-education(data.education)
}

#extra-section(
  text-of(section-titles.at("profiles", default: "Profiles")),
  profile-items.map(item =>
    line-entry(
      text-of-item(item, "network"),
      link-or-text(
        if text-of-item(item, "username") != "" {
          text-of-item(item, "username")
        } else {
          text-of-item(item, "url")
        },
        text-of-item(item, "url"),
      ),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("customFields", default: "Custom Fields")),
  custom-field-items.map(item =>
    line-entry(
      if text-of-item(item, "title") != "" and text-of-item(item, "title") != text-of-item(item, "text") {
        strong(text-of-item(item, "title"))
      } else if text-of-item(item, "title") != "" {
        text-of-item(item, "title")
      } else {
        text-of-item(item, "text")
      },
      if text-of-item(item, "url") != "" {
        if text-of-item(item, "title") != "" and text-of-item(item, "title") != text-of-item(item, "text") {
          [
            #link-or-text(text-of-item(item, "text"), text-of-item(item, "url"))
          ]
        } else {
          [
            #link(text-of-item(item, "url"))[#text-of-item(item, "url")]
          ]
        }
      } else if text-of-item(item, "title") != "" and text-of-item(item, "title") != text-of-item(item, "text") {
        [
          #text-of-item(item, "text")
        ]
      } else {
        []
      },
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("languages", default: "Languages")),
  list-of(source.at("languages", default: ())).map(item =>
    line-entry(
      text-of-item(item, "language"),
      [
        #if text-of-item(item, "fluency") != "" [
          #text-of-item(item, "fluency")
        ]
        #if with-default(item.at("level", default: none), none) != none [
          #if text-of-item(item, "fluency") != "" [#h(6pt)|#h(6pt)]
          Level #with-default(item.at("level", default: 0), 0)
        ]
      ],
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("interests", default: "Interests")),
  list-of(source.at("interests", default: ())).map(item =>
    line-entry(
      text-of-item(item, "name"),
      list-of(item.at("keywords", default: ())).join(", "),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("awards", default: "Awards")),
  list-of(source.at("awards", default: ())).map(entry =>
    timeline-entry(
      linked-entry-label(entry, text-of-item(entry, "title")),
      subtitle: text-of-item(entry, "subtitle"),
      date: text-of-item(entry, "date"),
      trailing: bullet-trailing(entry),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("certifications", default: "Certifications")),
  list-of(source.at("certifications", default: ())).map(entry =>
    timeline-entry(
      linked-entry-label(entry, text-of-item(entry, "title")),
      subtitle: text-of-item(entry, "subtitle"),
      date: text-of-item(entry, "date"),
      trailing: bullet-trailing(entry),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("publications", default: "Publications")),
  list-of(source.at("publications", default: ())).map(entry =>
    timeline-entry(
      linked-entry-label(entry, text-of-item(entry, "title")),
      subtitle: text-of-item(entry, "subtitle"),
      date: text-of-item(entry, "date"),
      trailing: bullet-trailing(entry),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("volunteer", default: "Volunteer")),
  list-of(source.at("volunteer", default: ())).map(entry =>
    timeline-entry(
      linked-entry-label(entry, text-of-item(entry, "title")),
      subtitle: text-of-item(entry, "subtitle"),
      date: text-of-item(entry, "date"),
      trailing: bullet-trailing(entry),
    ),
  ),
)

#extra-section(
  text-of(section-titles.at("references", default: "References")),
  list-of(source.at("references", default: ())).map(entry =>
    timeline-entry(
      linked-entry-label(entry, text-of-item(entry, "title")),
      subtitle: text-of-item(entry, "subtitle"),
      trailing: bullet-trailing(entry),
    ),
  ),
)
