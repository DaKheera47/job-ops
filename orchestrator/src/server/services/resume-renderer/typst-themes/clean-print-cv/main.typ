#import "@preview/clean-print-cv:0.1.0": *

#let source = json(__RESUME_DATA_PATH__)

#let contact-items = source.at("contactItems", default: ())

#let value-or(value, fallback: "") = {
  if value == none {
    fallback
  } else {
    value
  }
}

#let text-of(item) = value-or(item.at("text", default: ""))
#let url-of(item) = value-or(item.at("url", default: ""))

#let link-or-text(label, url) = {
  if url == "" {
    label
  } else {
    link(url)[#label]
  }
}

#let linked-entry-label(entry, label) = {
  link-or-text(label, url-of(entry))
}

#let contact-matching(predicate) = {
  let matches = contact-items.filter(predicate)
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
    link-or-text(text-of(item), url-of(item))
  }
}

#let entry-subtitle(entry) = value-or(entry.at("subtitle", default: ""))
#let entry-subtitle-part(entry, index) = {
  let subtitle = entry-subtitle(entry)
  let parts = subtitle.split(" / ")
  if parts.len() > index {
    parts.at(index)
  } else {
    ""
  }
}
#let entry-role(entry) = entry-subtitle-part(entry, 0)
#let entry-location(entry) = entry-subtitle-part(entry, 1)
#let entry-details(entry) = entry.at("bullets", default: ()).join(" ")

#let is-email(item) = {
  let text = text-of(item)
  let url = url-of(item)
  text.contains("@") or url.starts-with("mailto:")
}

#let is-linkedin(item) = {
  let text = text-of(item)
  let url = url-of(item)
  text.contains("LinkedIn") or text.contains("linkedin") or url.contains("linkedin")
}

#let is-github(item) = {
  let text = text-of(item)
  let url = url-of(item)
  text.contains("GitHub") or text.contains("Github") or text.contains("github") or url.contains("github")
}

#let is-website(item) = {
  let url = url-of(item)
  url != "" and not is-email(item) and not is-linkedin(item) and not is-github(item)
}

#let is-phone(item) = {
  url-of(item) == "" and not is-email(item)
}

#let linked-url-label(entry) = {
  let url = url-of(entry)
  if url == "" {
    []
  } else {
    link(url)[#url]
  }
}

#let data = (
  personal: (
    name: source.at("name", default: ""),
    title: value-or(source.at("headline", default: "")),
    email: contact-label-matching(is-email),
    phone: contact-label-matching(is-phone),
    location: [],
    linkedin: contact-label-matching(is-linkedin),
    github: contact-label-matching(is-github),
    website: contact-label-matching(is-website),
  ),
  summary: value-or(source.at("summary", default: "")),
  skills: source.at("skillGroups", default: ()).map(group => (
    category: group.at("name", default: ""),
    items: group.at("keywords", default: ()),
  )),
  experience: source.at("experience", default: ()).map(entry => (
    role: entry-role(entry),
    company: linked-entry-label(entry, entry.at("title", default: "")),
    location: entry-location(entry),
    period: value-or(entry.at("date", default: "")),
    highlights: entry.at("bullets", default: ()),
  )),
  projects: source.at("projects", default: ()).map(entry => (
    name: linked-entry-label(entry, entry.at("title", default: "")),
    url: linked-url-label(entry),
    description: entry-details(entry),
  )),
  certifications: (),
  education: source.at("education", default: ()).map(entry => (
    degree: entry-subtitle(entry),
    institution: linked-entry-label(entry, entry.at("title", default: "")),
    location: entry-location(entry),
    period: value-or(entry.at("date", default: "")),
    details: entry-details(entry),
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
