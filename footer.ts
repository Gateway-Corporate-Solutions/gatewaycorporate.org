interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export type FooterVariant = "default" | "nashtwin" | "devicer" | "hyperlocal";

const brandCopy = "Premiere technology services for the St. Louis area and beyond. Guiding you towards unprecedented success.";

const serviceColumn: FooterColumn = {
  heading: "Services",
  links: [
    { label: "Web Development", href: "/#services" },
    { label: "AI Integration", href: "/#services" },
    { label: "Custom Software", href: "/#services" },
    { label: "Maintenance", href: "/#services" },
  ],
};

const companyColumn: FooterColumn = {
  heading: "Company",
  links: [
    { label: "About", href: "/#about" },
    { label: "Careers", href: "/careers" },
    { label: "Journal", href: "/blog" },
    { label: "Team", href: "/#team" },
    { label: "Projects", href: "/#projects" },
    { label: "Contact", href: "/#contact" },
  ],
};

const variantColumns: Record<FooterVariant, FooterColumn> = {
  default: {
    heading: "Journal",
    links: [
      { label: "All articles", href: "/blog" },
      { label: "Project work", href: "/#projects" },
    ],
  },
  nashtwin: {
    heading: "NashTwin",
    links: [
      { label: "Problem", href: "/nashtwin.html#problem" },
      { label: "How It Works", href: "/nashtwin.html#twin" },
      { label: "Features", href: "/nashtwin.html#features" },
      { label: "Pricing", href: "/nashtwin.html#pricing" },
    ],
  },
  devicer: {
    heading: "Devicer",
    links: [
      { label: "Problem", href: "/devicer.html#problem" },
      { label: "Suite", href: "/devicer.html#suite" },
      { label: "Features", href: "/devicer.html#features" },
      { label: "Pricing", href: "/devicer.html#pricing" },
    ],
  },
  hyperlocal: {
    heading: "HyperLocal",
    links: [
      { label: "Problem", href: "/hyperlocal.html#problem" },
      { label: "Solution", href: "/hyperlocal.html#solution" },
      { label: "Features", href: "/hyperlocal.html#features" },
      { label: "Pricing", href: "/hyperlocal.html#pricing" },
    ],
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLinkList(column: FooterColumn): string {
  return `
          <div>
            <h4 class="heading-4 mb-md">${escapeHtml(column.heading)}</h4>
            <ul style="list-style: none; padding: 0">
              ${column.links.map((link) => `<li class="mb-xs"><a href="${escapeHtml(link.href)}" class="text-small footer-link">${escapeHtml(link.label)}</a></li>`).join("\n              ")}
            </ul>
          </div>`;
}

export function resolveFooterVariant(view?: string): FooterVariant {
  switch (view) {
    case "nashtwin":
    case "devicer":
    case "hyperlocal":
      return view;
    default:
      return "default";
  }
}

export function renderSiteFooter(variant: FooterVariant = "default"): string {
  const pageColumn = variantColumns[variant] ?? variantColumns.default;

  return `
    <footer class="footer">
      <div class="container">
        <div class="grid grid-4 gap-lg mb-xl" style="text-align: left; padding-bottom: var(--spacing-md);">
          <div>
            <h4 class="heading-4 mb-md">Gateway Corporate</h4>
            <p class="text-small">${escapeHtml(brandCopy)}</p>
          </div>
          ${renderLinkList(serviceColumn)}
          ${renderLinkList(pageColumn)}
          ${renderLinkList(companyColumn)}
        </div>
        <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: var(--spacing-md); text-align: center">
          <p class="text-base">&copy; ${new Date().getFullYear()} Gateway Corporate. All rights reserved.</p>
        </div>
      </div>
    </footer>`;
}

export function injectFooterIntoHtml(html: string, variant: FooterVariant = "default"): string {
  const footer = renderSiteFooter(variant);

  if (html.includes("{{SITE_FOOTER}}")) {
    return html.replace("{{SITE_FOOTER}}", footer);
  }

  if (/<footer class="footer">[\s\S]*?<\/footer>/i.test(html)) {
    return html.replace(/<footer class="footer">[\s\S]*?<\/footer>/i, footer);
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}\n  </body>`);
  }

  return `${html}\n${footer}`;
}