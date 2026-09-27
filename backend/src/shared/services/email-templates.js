// Brand Configuration
const BRAND = {
  name: 'Solution Maxi',
  color: {
    primary: '#1e3d9d', // Deep Blue
    accent: '#fd6428',  // Orange
    bg: '#f4f7fa',      // Light Gray Background
    text: '#334155'     // Slate Text
  },
  logoUrl: `https://test.solutionmaxi.com/logo.jpg` 
};

/**
 * Base HTML Wrapper with Enhanced Design
 */
const wrapHtml = (content, title) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.color.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.color.bg};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- MAIN CONTAINER -->
        <table role="presentation" width="650" border="0" cellspacing="0" cellpadding="0" style="max-width: 650px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(30, 61, 157, 0.08);">
          
          <!-- DECORATIVE HEADER BAR -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND.color.primary} 0%, #2d5db8 100%); height: 6px; line-height: 0; font-size: 0;">
              &nbsp;
            </td>
          </tr>

          <!-- LOGO SECTION -->
          <tr>
            <td align="center" style="padding: 40px 40px 0 40px;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, ${BRAND.color.primary} 0%, #2d5db8 100%); border-radius: 16px; padding: 16px 32px; box-shadow: 0 4px 16px ${BRAND.color.primary}30;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; text-transform: uppercase;">
                      ${BRAND.name}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding: 40px 40px 50px 40px;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px 40px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                      <strong style="color: ${BRAND.color.primary};">${BRAND.name}</strong> - Votre partenaire e-commerce en Algérie
                    </p>
                    <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px;">
                      &copy; ${new Date().getFullYear()} ${BRAND.name}. Tous droits réservés.
                    </p>
                    <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                      Ceci est un email automatique, merci de ne pas répondre.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>

</body>
</html>
`;

/**
 * 1. Enhanced Verification Email Template
 */
export const getVerificationTemplate = (url, name) => {
  const content = `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
      <!-- Icon -->
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background: linear-gradient(135deg, ${BRAND.color.accent}20 0%, ${BRAND.color.accent}10 100%); border-radius: 50%; width: 80px; height: 80px; text-align: center; vertical-align: middle; box-shadow: 0 8px 20px ${BRAND.color.accent}20;">
                <span style="font-size: 40px; line-height: 80px;">✉️</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Greeting -->
      <tr>
        <td align="center" style="padding-bottom: 12px;">
          <h2 style="color: ${BRAND.color.primary}; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
            Bienvenue, ${name} !
          </h2>
        </td>
      </tr>

      <!-- Subtitle -->
      <tr>
        <td align="center" style="padding-bottom: 30px;">
          <p style="color: ${BRAND.color.accent}; font-size: 15px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Confirmez votre inscription
          </p>
        </td>
      </tr>
      
      <!-- Main Message -->
      <tr>
        <td style="padding-bottom: 35px;">
          <p style="color: ${BRAND.color.text}; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">
            Merci d'avoir rejoint <strong style="color: ${BRAND.color.primary};">${BRAND.name}</strong> ! 🎉
            <br>
            Pour activer votre compte et profiter de tous nos services, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous.
          </p>
        </td>
      </tr>

      <!-- CTA Button -->
      <tr>
        <td align="center" style="padding-bottom: 35px;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-radius: 12px; background: linear-gradient(135deg, ${BRAND.color.accent} 0%, #ff7a45 100%); box-shadow: 0 6px 20px ${BRAND.color.accent}40;">
                <a href="${url}" style="background-color: transparent; border: none; color: #ffffff; padding: 16px 48px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; letter-spacing: 0.3px; text-transform: uppercase;">
                  Vérifier mon Email →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Divider -->
      <tr>
        <td style="padding: 25px 0;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-bottom: 2px solid #e2e8f0;"></td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Alternative Link Section -->
      <tr>
        <td style="background-color: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${BRAND.color.primary};">
          <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0; font-weight: 600;">
            Le bouton ne fonctionne pas ?
          </p>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0;">
            Copiez et collez ce lien dans votre navigateur :
          </p>
          <p style="margin: 0;">
            <a href="${url}" style="color: ${BRAND.color.primary}; font-size: 12px; word-break: break-all; text-decoration: underline;">
              ${url}
            </a>
          </p>
        </td>
      </tr>

      <!-- Security Note -->
      <tr>
        <td align="center" style="padding-top: 30px;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0; font-style: italic;">
            🔒 Ce lien est sécurisé et personnel
          </p>
        </td>
      </tr>
    </table>
  `;
  return wrapHtml(content, 'Vérifiez votre email - Solution Maxi');
};

/**
 * 2. Enhanced Password Reset Template
 */
export const getResetPasswordTemplate = (url) => {
  const content = `
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
      <!-- Icon -->
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 50%; width: 80px; height: 80px; text-align: center; vertical-align: middle; box-shadow: 0 8px 20px rgba(239, 68, 68, 0.15); border: 3px solid #fecaca;">
                <span style="font-size: 40px; line-height: 80px;">🔐</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Title -->
      <tr>
        <td align="center" style="padding-bottom: 12px;">
          <h2 style="color: ${BRAND.color.primary}; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
            Réinitialisation de mot de passe
          </h2>
        </td>
      </tr>

      <!-- Subtitle -->
      <tr>
        <td align="center" style="padding-bottom: 30px;">
          <p style="color: #ef4444; font-size: 15px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Demande de sécurité
          </p>
        </td>
      </tr>
      
      <!-- Main Message -->
      <tr>
        <td style="padding-bottom: 35px;">
          <p style="color: ${BRAND.color.text}; font-size: 16px; line-height: 1.7; margin: 0; text-align: center;">
            Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte <strong style="color: ${BRAND.color.primary};">${BRAND.name}</strong>.
            <br><br>
            Pour créer un nouveau mot de passe, cliquez sur le bouton ci-dessous :
          </p>
        </td>
      </tr>

      <!-- CTA Button -->
      <tr>
        <td align="center" style="padding-bottom: 35px;">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-radius: 12px; background: linear-gradient(135deg, ${BRAND.color.primary} 0%, #2d5db8 100%); box-shadow: 0 6px 20px ${BRAND.color.primary}40;">
                <a href="${url}" style="background-color: transparent; border: none; color: #ffffff; padding: 16px 48px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; letter-spacing: 0.3px; text-transform: uppercase;">
                  Changer mon mot de passe →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Important Notice Box -->
      <tr>
        <td style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b; margin-bottom: 25px;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding-bottom: 10px;">
                <p style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0;">
                  ⚠️ Informations importantes
                </p>
              </td>
            </tr>
            <tr>
              <td>
                <ul style="color: #78350f; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.6;">
                  <li style="margin-bottom: 6px;">Ce lien expire dans <strong>1 heure</strong></li>
                  <li style="margin-bottom: 6px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email</li>
                  <li>Votre mot de passe actuel reste valide jusqu'au changement</li>
                </ul>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Divider -->
      <tr>
        <td style="padding: 25px 0;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-bottom: 2px solid #e2e8f0;"></td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Alternative Link Section -->
      <tr>
        <td style="background-color: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${BRAND.color.primary};">
          <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0; font-weight: 600;">
            Le bouton ne fonctionne pas ?
          </p>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0;">
            Copiez et collez ce lien dans votre navigateur :
          </p>
          <p style="margin: 0;">
            <a href="${url}" style="color: ${BRAND.color.primary}; font-size: 12px; word-break: break-all; text-decoration: underline;">
              ${url}
            </a>
          </p>
        </td>
      </tr>

      <!-- Security Footer -->
      <tr>
        <td align="center" style="padding-top: 30px;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0; font-style: italic;">
            🛡️ Cet email a été envoyé de manière sécurisée par ${BRAND.name}
          </p>
        </td>
      </tr>
    </table>
  `;
  return wrapHtml(content, 'Réinitialisation mot de passe - Solution Maxi');
};