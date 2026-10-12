// Step-by-step instructions shown on manual and untestable findings.
export const MANUAL_STEPS = {
  generic:
    'Open the page in Chrome with Tag Assistant (tagassistant.google.com) connected, or with DevTools open. ' +
    '1) Network tab: check which tracking requests are sent. 2) Console: look for "Content Security Policy" errors. ' +
    '3) Application → Cookies: check which cookies are set. Repeat in a fresh incognito window after accepting, and again after rejecting, cookies.',
  reject:
    'Open the page in a fresh incognito window with DevTools → Network open. Click the cookie banner\'s reject option, then reload. ' +
    'Filter the Network tab for google, facebook, hubspot, linkedin and other tracking domains: there should be no requests. ' +
    'Application → Cookies should show no analytics or marketing cookies.',
  granular:
    'In a fresh incognito window, accept only the Statistics/Analytics category and reload. Google Analytics requests (google-analytics.com/g/collect) may appear; ' +
    'Google Ads requests (googleads.g.doubleclick.net, google.com/pagead, google.com/ccm) must not. Repeat with only Marketing accepted: Google Analytics requests must not appear.',
  tags:
    'Open both sites with Tag Assistant connected and accept cookies. Compare the Google tags listed for each site. ' +
    'For other tools, compare DevTools → Network requests to the vendor domains on both sites.',
};
