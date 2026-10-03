import type { ContentPageData } from './types';

// Terms of Service. Legal text: change only together with a new TERMS_VERSION and
// effective date, and notify account holders of material changes (section 12).
export const TERMS_VERSION = '1.0';
export const TERMS_EFFECTIVE = '3 October 2026';

export const TERMS: ContentPageData = {
  path: '/terms/',
  breadcrumb: [{ label: 'Terms of Service', path: '/terms/' }],
  eyebrow: 'Legal',
  h1: 'Terms of Service',
  lead: `Version ${TERMS_VERSION}, effective ${TERMS_EFFECTIVE}. These terms govern your use of the CortIQ service. Processing of your website visitors' personal data is governed by our Data Processing Agreement.`,
  sections: [
    {
      id: 'parties',
      heading: '1. Who we are and what the terms cover',
      blocks: [
        { type: 'p', text: 'CortIQ is provided by Expandtalk Corporation AB, company registration number 559358-8824, Parmmätaregatan 4B, 417 04 Göteborg, Sweden ("CortIQ", "we", "us").' },
        { type: 'p', text: 'The "Service" means the CortIQ dashboard at cortiq.se, the tracking script, the WordPress plugin, the Cloudflare Worker, the REST API, the MCP server and related documentation. "You" means the business or organisation that creates an account. The individual who accepts these terms does so on its behalf and confirms that they are authorised to do so.' },
        { type: 'p', text: 'You accept these terms when you create an account by ticking the acceptance box. Installing the tracking script, plugin or Worker with your keys also confirms your acceptance of the version then in force.' },
        { type: 'p', text: 'You may only use the Service for purposes relating to your business, trade or profession. By accepting, you confirm that you are not acting as a consumer. If mandatory consumer protection law nevertheless applies, it applies in addition to these terms.' },
      ],
    },
    {
      id: 'beta',
      heading: '2. Beta and fees',
      blocks: [
        { type: 'p', text: 'The Service is in beta and is currently free of charge. During the beta, features may be added, changed or removed, and there is no guaranteed availability or support response time.' },
        { type: 'p', text: 'We will notify you by email at least 30 days before we introduce fees for a feature you use. Nothing becomes payable unless you actively accept the new price. If you do not, you can keep using any free plan we offer or close your account.' },
      ],
    },
    {
      id: 'account',
      heading: '3. Your account',
      blocks: [
        {
          type: 'list',
          items: [
            'Give accurate information when you register and keep it up to date.',
            'Keep your login details, tracking keys and API keys confidential. You are responsible for activity under your account and keys until you tell us that they have been compromised, or disable them in the dashboard.',
            'Tell us without undue delay at privacy@cortiq.se if you suspect unauthorised access to your account.',
          ],
        },
      ],
    },
    {
      id: 'data',
      heading: '4. Your data and data protection',
      blocks: [
        { type: 'p', text: 'For personal data about visitors to your websites, you are the controller and CortIQ is your processor. That processing is governed by the [Data Processing Agreement](https://github.com/ExpandTalk-Corporation/Cortiq/blob/main/DPA.md), which forms part of these terms. If these terms and the Data Processing Agreement conflict on the processing of personal data, the Data Processing Agreement prevails.' },
        { type: 'p', text: 'In case of conflict, the Data Processing Agreement prevails for personal data, and these terms for everything else.' },
        { type: 'p', text: 'You are responsible for having a legal basis for the measurement you run, for collecting any consent that is required, and for informing your visitors, including that CortIQ processes data on your behalf. The [documentation](/docs/#consent) describes what the script does with and without consent; the legal assessment for your site is yours.' },
        { type: 'p', text: 'For your account data (for example your name and email address), CortIQ is the controller. See the [privacy policy](/privacy/).' },
        { type: 'p', text: 'You keep all rights to your data. You give us the right to process it only to provide and secure the Service and as described in the Data Processing Agreement. We may use aggregated, anonymised statistics that do not identify you, your sites or any individual to improve the Service.' },
      ],
    },
    {
      id: 'acceptable-use',
      heading: '5. Acceptable use',
      blocks: [
        { type: 'p', text: 'You may not:' },
        {
          type: 'list',
          items: [
            'install the tracking script, plugin or Worker on websites that you do not own or are not authorised to measure;',
            'use the Service to collect special categories of personal data, or to identify individual visitors in ways your visitors have not been informed about;',
            'attempt to access other customers\' data, test or circumvent the Service\'s security without our written permission (see our [security page](/security/) for responsible disclosure), or interfere with the Service\'s operation;',
            'exceed rate limits, send automated traffic designed to overload the Service, or resell access to the Service without our written consent;',
            'use the Service in breach of applicable law.',
          ],
        },
        { type: 'p', text: 'You will compensate us for third-party claims, including claims by data subjects or authorities, to the extent they arise from your breach of section 4 or this section.' },
      ],
    },
    {
      id: 'third-parties',
      heading: '6. Integrations and AI features',
      blocks: [
        { type: 'p', text: 'Integrations with third-party services (for example Google Analytics, Google Search Console, Cloudflare and WordPress) are optional. Your use of those services is governed by your agreements with their providers, and we are not responsible for them or for changes they make that affect an integration.' },
        { type: 'p', text: 'AI features use your own Anthropic API key. You are responsible for the costs under your agreement with Anthropic. AI-generated insights can be wrong; check them against the underlying data, which the Service shows alongside each insight, before you act on them.' },
      ],
    },
    {
      id: 'software',
      heading: '7. Open-source software',
      blocks: [
        { type: 'p', text: 'The CortIQ source code is published under the [GNU Affero General Public License v3.0](https://github.com/ExpandTalk-Corporation/Cortiq/blob/main/LICENSE). That licence governs your rights to the software itself. These terms govern the hosted Service that we operate: we grant you a non-exclusive, non-transferable right to use it while these terms apply. The CortIQ name and logo are not licensed under the AGPL, and all other rights in the Service remain with us.' },
      ],
    },
    {
      id: 'warranty',
      heading: '8. The Service is provided as is',
      blocks: [
        { type: 'p', text: 'We work to keep the Service secure, available and accurate, but during the beta it is provided "as is". To the extent permitted by law, we give no warranty that the Service will be uninterrupted or error-free, or that measurements, classifications or AI-generated insights are complete or correct.' },
      ],
    },
    {
      id: 'liability',
      heading: '9. Limitation of liability',
      blocks: [
        { type: 'p', text: 'We are not liable for indirect or consequential loss, such as loss of profit, revenue or goodwill, or for loss caused by third-party services that you choose to connect under section 6. This does not limit our responsibility for our subprocessors under the Data Processing Agreement.' },
        { type: 'p', text: 'Our total liability under these terms and the Data Processing Agreement together is subject to one aggregate cap: the greater of (a) the fees you paid us in the 12 months before the event that gave rise to the claim, and (b) EUR 500.' },
        { type: 'p', text: 'These limitations do not apply to damage caused intentionally or through gross negligence, or to liability that cannot be limited under applicable law. They also do not affect a data subject\'s rights to compensation under Article 82 of the GDPR.' },
        { type: 'p', text: 'A claim must be made in writing within six months of when you became aware, or should have become aware, of the circumstances giving rise to it; otherwise the claim is lost.' },
      ],
    },
    {
      id: 'termination',
      heading: '10. Suspension and termination',
      blocks: [
        { type: 'p', text: 'You can stop using the Service and delete your sites or account at any time. Deleting a site deletes its data immediately. When you close your account, all remaining data is deleted within 30 days, unless the law requires us to keep it.' },
        { type: 'p', text: 'We may suspend access, wholly or in part, if you materially breach these terms, if your use threatens the security or operation of the Service, or if the law requires it. Where possible we will tell you first and give you a reasonable opportunity to remedy the breach.' },
        { type: 'p', text: 'We may end the Service, or the beta, with at least 60 days\' notice by email.' },
        { type: 'p', text: 'You can export your data in a structured, machine-readable format at any time, and for at least 30 days after notice of termination by either party. On request we will help you switch to another provider as required by the EU Data Act (Regulation (EU) 2023/2854).' },
      ],
    },
    {
      id: 'force-majeure',
      heading: '11. Events beyond our control',
      blocks: [
        { type: 'p', text: 'Neither party is liable for failure to perform caused by circumstances beyond its reasonable control, such as failures of hosting or network providers, power outages, cyberattacks, strikes, government action or natural disasters.' },
      ],
    },
    {
      id: 'changes',
      heading: '12. Changes to these terms',
      blocks: [
        { type: 'p', text: 'We may change these terms. We will notify you by email at least 30 days before a material change takes effect. If you continue to use the Service after that date, the new terms apply. If you do not accept them, you can close your account before that date. Changes that are not material, or that are required by law, take effect when published.' },
      ],
    },
    {
      id: 'general',
      heading: '13. General',
      blocks: [
        {
          type: 'list',
          items: [
            'Notices to you are sent to the email address of your account.',
            'We may transfer these terms to a company that takes over the Service. We will notify you.',
            'If a provision is invalid, the rest of these terms remains in force.',
            'Sections 4, 9 and 14 continue to apply after these terms end.',
            'These terms are written in English. Any translation is for convenience only.',
          ],
        },
      ],
    },
    {
      id: 'law',
      heading: '14. Governing law and disputes',
      blocks: [
        { type: 'p', text: 'These terms are governed by Swedish law, without regard to its conflict-of-law rules. Disputes are settled by Swedish general courts, with Göteborg District Court (Göteborgs tingsrätt) as the court of first instance.' },
      ],
    },
    {
      id: 'contact',
      heading: '15. Contact',
      blocks: [
        { type: 'p', text: 'Expandtalk Corporation AB, Parmmätaregatan 4B, 417 04 Göteborg, Sweden. Email: privacy@cortiq.se. You can also use the [contact page](/contact/).' },
      ],
    },
  ],
  related: [
    { label: 'Privacy policy', path: '/privacy/' },
    { label: 'Security', path: '/security/' },
    { label: 'Cookies', path: '/cookies/' },
  ],
};
