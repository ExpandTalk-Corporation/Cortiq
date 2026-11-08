# CortIQ licensing

Copyright (C) 2024–2026 Expandtalk Corporation AB

CortIQ is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version. See [LICENSE](./LICENSE).

CortIQ is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

## Embedding exception

Additional permission under section 7 of the GNU Affero General Public License, version 3.

The code you put on your own website, server or agent to send data to CortIQ should not
place your own code under the AGPL. As the copyright holder, Expandtalk Corporation AB
therefore also licenses the **Embeddable Components** listed below under the MIT License
(text below). You may use, copy, modify and distribute them under either the MIT License
or the AGPL, at your choice.

**Embeddable Components** are:

1. the JavaScript files in `public/` (top level only), including `spa-tracking.js`, its
   minified build `cortiq.js`, `consent-banner.js` and `consent-banner.min.js`;
2. the server-side adapters `public/cortiq-server.mjs`, `public/cloudflare-worker.js` and
   `public/cortiq-server-php.txt`;
3. `src/lib/aggregate-beacon.js`;
4. the agent instrumentation SDKs `src/lib/cortiq-agent-tracker.ts` and
   `src/lib/cortiq-mcp-telemetry.ts`;
5. the install snippet that CortIQ generates for a site (`src/lib/snippetTemplate.ts` and
   `src/lib/trackingSnippet.ts`), and the code it outputs.

Websites, applications, servers and agents that include, load or call the Embeddable
Components, or that send data to a CortIQ service over its HTTP APIs, are not derivative
works of CortIQ because of that, and this License sets no conditions for them.

The exception covers only the Embeddable Components. The rest of CortIQ, including the
dashboard, the Edge Functions and the database schema, is licensed under the AGPL alone. If
you run a modified version of it as a network service, section 13 of the AGPL applies.

The WordPress plugin in `wordpress-plugin/` is licensed under the GNU General Public
License, version 2 or later, as stated in its header.

## MIT License

Copyright (C) 2024–2026 Expandtalk Corporation AB

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
