#import "@preview/clean-print-cv:0.1.0": *

#let source = json(__RESUME_DATA_PATH__)

#let value-or(value, fallback: "") = {
  if value == none {
    fallback
  } else {
    value
  }
}

#let contact-at(index) = {
  let items = source.at("contactItems", default: ())
  if items.len() > index {
    value-or(items.at(index).at("text", default: ""))
  } else {
    ""
  }
}

#let entry-subtitle(entry) = value-or(entry.at("subtitle", default: ""))
#let entry-location(entry) = {
  let subtitle = entry-subtitle(entry)
  let parts = subtitle.split(" / ")
  if parts.len() > 1 {
    parts.at(1)
  } else {
    ""
  }
}

#let data = (
  personal: (
    name: source.at("name", default: ""),
    title: value-or(source.at("headline", default: "")),
    email: contact-at(0),
    phone: contact-at(1),
    location: contact-at(2),
    linkedin: contact-at(3),
    github: contact-at(4),
    website: contact-at(5),
  ),
  summary: value-or(source.at("summary", default: "")),
  skills: source.at("skillGroups", default: ()).map(group => (
    category: group.at("name", default: ""),
    items: group.at("keywords", default: ()),
  )),
  experience: source.at("experience", default: ()).map(entry => (
    role: entry.at("title", default: ""),
    company: entry-subtitle(entry),
    location: entry-location(entry),
    period: value-or(entry.at("date", default: "")),
    highlights: entry.at("bullets", default: ()),
  )),
  projects: source.at("projects", default: ()).map(entry => (
    name: entry.at("title", default: ""),
    url: value-or(entry.at("url", default: "")),
    description: entry.at("bullets", default: ()).join(" "),
  )),
  certifications: (),
  education: source.at("education", default: ()).map(entry => (
    degree: entry.at("title", default: ""),
    institution: entry-subtitle(entry),
    location: entry-location(entry),
    period: value-or(entry.at("date", default: "")),
    details: entry.at("bullets", default: ()).join(" "),
  )),
  languages: (),
)

#show: cv-page-setup

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

#if data.certifications.len() > 0 {
  cv-certifications(data.certifications)
}

#if data.education.len() > 0 {
  cv-education(data.education)
}

#if data.languages.len() > 0 {
  cv-languages(data.languages)
}
