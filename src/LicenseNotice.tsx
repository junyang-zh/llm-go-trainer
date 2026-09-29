import license from '../LICENSE?raw';
import katagoLicense from '../config/katago/KATAGO-LICENSE.txt?raw';
import modelLicense from '../config/katago/MODEL-LICENSE.txt?raw';
import { cwiSourceUrl } from '../shared/presets';
import { t } from './i18n';

export function LicenseNotice() {
  return (
    <section className="license-notice" aria-labelledby="license-heading">
      <h3 id="license-heading">{t('licenseAndCopyright')}</h3>
      <p>Copyright © 2026 Zhang Junyang</p>
      <p>{t('projectMitLicense')}</p>
      <details>
        <summary>{t('mitLicenseFullText')}</summary>
        <pre lang="en">{license}</pre>
      </details>
      <h4>{t('thirdPartyNotices')}</h4>
      <p>{t('thirdPartyLicenseScope')}</p>
      <p>
        <a href="https://github.com/lightvector/KataGo" target="_blank" rel="noreferrer">
          KataGo
        </a>
        {' — '}
        {t('katagoCopyrightNotice')}
      </p>
      <details>
        <summary>{t('katagoLicenseFullText')}</summary>
        <pre lang="en">{katagoLicense}</pre>
      </details>
      <p>
        <a href="https://katagotraining.org/network_license/" target="_blank" rel="noreferrer">
          KataGo Neural Network License
        </a>
        {' — '}
        {t('katagoModelCopyrightNotice')}
      </p>
      <details>
        <summary>{t('modelLicenseFullText')}</summary>
        <pre lang="en">{modelLicense}</pre>
      </details>
      <p>
        <a href={cwiSourceUrl} target="_blank" rel="noreferrer">
          Andries E. Brouwer / CWI · Database of Go Games
        </a>
        {' — '}
        {t('cwiCopyrightNotice')}
      </p>
      <p>
        <a href="https://www.foxwq.com/" target="_blank" rel="noreferrer">
          {t('foxRecords')}
        </a>
        {' — '}
        {t('otherRecordsCopyrightNotice')}
      </p>
      <p>{t('dependenciesCopyrightNotice')}</p>
    </section>
  );
}
