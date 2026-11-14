VČELAŘ – OSEK | ZDROJOVÝ PROJEKT S CLOUDOVÝM SESTAVENÍM APK

Tento ZIP obsahuje zdrojový projekt aplikace a workflow pro automatické sestavení Android APK přes GitHub Actions.
NENÍ to hotový APK. APK vznikne až po nahrání projektu do GitHub repozitáře a úspěšném běhu workflow.

JAK ZÍSKAT APK POUZE POMOCÍ TELEFONU
1. Na github.com se přihlas ke svému účtu a vytvoř nový repozitář, například vcelar-osek.
2. Nastav jej jako Private (soukromý) a vytvoř jej prázdný, bez README.
3. Na stránce repozitáře zvol Add file > Upload files a nahraj obsah tohoto ZIPu (nejprve ZIP rozbal v telefonu; nahraj soubory a složky, včetně skryté složky .github).
4. Potvrď Commit changes.
5. Otevři záložku Actions. Workflow Build Android APK se spustí automaticky.
6. Po dokončení zeleným stavem otevři běh workflow, najdi sekci Artifacts a stáhni vcelar-osek-android-debug-apk.
7. Rozbal stažený ZIP s artefaktem. Soubor app-debug.apk otevři v Androidu a povol instalaci z tohoto zdroje, pokud se Android zeptá.

POZNÁMKY
- Pokud mobilní web GitHub neumožní nahrát složku .github, lze workflow vytvořit ručně jako soubor .github/workflows/android-apk.yml s obsahem přiloženým v tomto projektu.
- Debug APK je určen pro testování a přímou instalaci, není to podepsaná verze pro Google Play.
- iOS aplikace vyžaduje samostatné sestavení a podpis od Applu; bez placeného Apple Developer Programu nelze standardně distribuovat přes TestFlight.
- Lokální data se ukládají v telefonu. Před ostrým používáním je potřeba otestovat export/import záloh a přenos dat mezi Androidem a iPhonem.
