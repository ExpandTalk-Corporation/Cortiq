# Publicera via FTP

**Automatiskt:** varje push till main bygger och laddar upp dist över FTPS (`.github/workflows/deploy-production.yml`) och kontrollerar sedan den levande sajten med `scripts/smoke-live.mjs`. Kräver secrets `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` och `FTP_REMOTE_DIR` (domänens webbrot). Kör workflowet manuellt med *dry_run* för att se vad som skulle laddas upp. Inget tas bort på servern. Stegen nedan är den manuella reservvägen.

Kör `npm run build` i projektet. Bygget uppdaterar även de minifierade spårningsskripten, förgenererar marknadssidorna och tar bort den tillfälliga SSR-katalogen.

Ladda upp **innehållet i dist**, inklusive `assets`, sidkatalogerna och den dolda filen `.htaccess`, till domänens webbrot på webbhotellet. Ladda inte upp själva dist-katalogen som en underkatalog. Konfigurationen är avsedd för Apache/Loopia och publicering direkt på domänens rot.

Ladda upp assets först och HTML-filer sist. Behåll tidigare hashade assets under övergången så att redan öppna sidor fortsätter fungera. Kontrollera därefter startsidan, `/features/analytics` och omladdning direkt på `/dashboard`.

FTP publicerar endast frontend och statiska skript. Supabase-funktioner och databasändringar måste driftsättas separat; de senaste serverrättningarna följer inte med FTP-uppladdningen. Se granskningsrapporten för återstående samtyckesintegration och verifiering före pilot.
