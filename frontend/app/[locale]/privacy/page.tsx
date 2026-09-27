"use client"

import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent } from "@/components/ui/card"

export default function PrivacyPage() {
  const { language } = useLanguage()

  const data =
    language === "ar"
      ? {
          title: "سياسة الخصوصية",
          lastUpdated: "آخر تحديث: يناير 2026",
          intro:
            "نحن في Solutionmaxi نتعامل مع بياناتك الشخصية بجدية. في هذه الصفحة نشرح بشكل بسيط ما نجمعه ولماذا وكيف نحميه.",
          sections: [
            {
              id: "data",
              title: "1. ما هي البيانات التي نجمعها",
              body: [
                "عند إنشاء حساب أو تمرير طلب، قد نطلب منك بيانات أساسية مثل الاسم الكامل، رقم الهاتف، البريد الإلكتروني وعنوان التوصيل.",
                "نجمع أيضاً بعض المعلومات التقنية بشكل تلقائي مثل نوع المتصفح، الصفحات التي تزورها وبيانات بسيطة لتحسين أداء الموقع وحمايته."
              ]
            },
            {
              id: "usage",
              title: "2. كيف نستخدم بياناتك",
              body: [
                "نستخدم بياناتك لمعالجة الطلبات، التواصل معك حول حالة الشحن، تقديم الدعم، وتحسين تجربة الاستخدام على الموقع.",
                "قد نرسل لك رسائل حول العروض أو المنتجات الجديدة فقط إذا اخترت استقبال هذه الرسائل، ويمكنك إلغاء الاشتراك في أي وقت."
              ]
            },
            {
              id: "sharing",
              title: "3. مشاركة البيانات مع أطراف أخرى",
              body: [
                "نشارك جزءاً محدوداً من بياناتك مع شركاء موثوقين فقط عندما يكون ذلك ضرورياً: مثل شركات التوصيل (لعناوين واستلام الطلبات) أو مزودي خدمات الدفع.",
                "لا نبيع بياناتك الشخصية لأي طرف ثالث لأغراض تجارية أو إعلانية."
              ]
            },
            {
              id: "security",
              title: "4. حماية وأمان البيانات",
              body: [
                "نطبق ضوابط تقنية وتنظيمية لحماية بياناتك، بما في ذلك تشفير الاتصال مع الموقع وإجراءات للحد من الوصول غير المصرح به.",
                "ورغم أننا نبذل جهداً كبيراً لتأمين البيانات، لا يوجد نظام متصل بالإنترنت آمن بنسبة 100٪."
              ]
            },
            {
              id: "rights",
              title: "5. حقوقك واختياراتك",
              body: [
                "يمكنك طلب الاطلاع على بياناتك الأساسية، تعديلها أو طلب حذفها عندما يكون ذلك ممكناً قانونياً وتشغيلياً.",
                "لديك أيضاً الحق في تغيير تفضيلات الاتصال أو إلغاء الاشتراك من الرسائل التسويقية في أي وقت."
              ]
            },
            {
              id: "retention",
              title: "6. مدة الاحتفاظ بالبيانات",
              body: [
                "نحتفظ بالبيانات طالما كان حسابك نشطاً أو طالما كان ذلك ضرورياً لتقديم الخدمة والوفاء بالالتزامات القانونية (مثل المحاسبة والضرائب).",
                "عند عدم الحاجة إلى البيانات بعد الآن، نقوم بحذفها أو إخفاء هويتها بشكل آمن."
              ]
            },
            {
              id: "changes",
              title: "7. تحديث سياسة الخصوصية",
              body: [
                "قد نقوم بتحديث هذه السياسة عند الحاجة لتغطية تغييرات تقنية أو قانونية أو في طريقة عملنا.",
                "سنحدث تاريخ آخر تعديل في أعلى الصفحة، ويمكنك دائماً مراجعة النسخة الأحدث هنا."
              ]
            }
          ],
          contactTitle: "أسئلة حول الخصوصية؟",
          contactText:
            "للاستفسار حول كيفية معالجة بياناتك الشخصية أو لممارسة حقوقك، راسل فريق حماية البيانات لدينا على:",
          backLabel: "← العودة للرئيسية"
        }
      : {
          title: "Politique de Confidentialité",
          lastUpdated: "Dernière mise à jour : janvier 2026",
          intro:
            "Chez Solutionmaxi, nous traitons vos données personnelles avec sérieux. Cette page résume de manière simple ce que nous collectons, pourquoi et comment nous les protégeons.",
          sections: [
            {
              id: "data",
              title: "1. Données que nous collectons",
              body: [
                "Lorsque vous créez un compte ou passez commande, nous pouvons vous demander des informations de base : nom complet, numéro de téléphone, email et adresse de livraison.",
                "Nous collectons aussi automatiquement certaines informations techniques (type de navigateur, pages consultées, données de performance) pour sécuriser et améliorer le site."
              ]
            },
            {
              id: "usage",
              title: "2. Utilisation de vos données",
              body: [
                "Nous utilisons vos données pour traiter vos commandes, vous informer de l'état de la livraison, fournir du support et améliorer nos produits et services.",
                "Nous pouvons vous envoyer des communications commerciales uniquement si vous y avez consenti, et vous pouvez vous désabonner à tout moment."
              ]
            },
            {
              id: "sharing",
              title: "3. Partage avec des tiers",
              body: [
                "Nous partageons uniquement les données nécessaires avec des partenaires de confiance, par exemple nos prestataires de livraison (pour l'adresse et le suivi) et prestataires de paiement.",
                "Nous ne vendons jamais vos données personnelles à des tiers à des fins marketing."
              ]
            },
            {
              id: "security",
              title: "4. Sécurité et protection",
              body: [
                "Nous mettons en place des mesures techniques et organisationnelles pour protéger vos données, comme le chiffrement des communications et la limitation des accès internes.",
                "Même avec ces mesures, aucun système connecté à Internet n'est sécurisé à 100 %, mais nous agissons rapidement en cas d'incident."
              ]
            },
            {
              id: "rights",
              title: "5. Vos droits et choix",
              body: [
                "Vous pouvez demander l'accès à vos informations de base, leur correction ou leur suppression lorsque cela est compatible avec nos obligations légales.",
                "Vous pouvez également modifier vos préférences de communication ou vous désabonner des emails marketing à tout moment."
              ]
            },
            {
              id: "retention",
              title: "6. Durée de conservation",
              body: [
                "Nous conservons vos données aussi longtemps que nécessaire pour gérer votre compte, exécuter vos commandes et respecter nos obligations légales (comptabilité, fiscalité, etc.).",
                "Lorsque les données ne sont plus nécessaires, nous les supprimons ou les anonymisons de manière sécurisée."
              ]
            },
            {
              id: "changes",
              title: "7. Évolution de cette politique",
              body: [
                "Nous pouvons mettre à jour cette politique pour refléter des évolutions réglementaires ou de nos services.",
                "La date en haut de la page indique la dernière version en vigueur. Nous vous invitons à la consulter régulièrement."
              ]
            }
          ],
          contactTitle: "Questions sur la confidentialité ?",
          contactText:
            "Pour toute question sur la manière dont nous traitons vos données personnelles ou pour exercer vos droits, vous pouvez contacter notre équipe dédiée à :",
          backLabel: "← Retour à l'accueil"
        }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="mb-10">
              <p className="text-sm uppercase tracking-wide text-muted-foreground mb-2">
                {language === "ar" ? "قانوني" : "Légal"}
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold mb-3">{data.title}</h1>
              <p className="text-sm text-muted-foreground mb-3">{data.lastUpdated}</p>
              <p className="text-base text-muted-foreground max-w-3xl">{data.intro}</p>
            </div>

            <Card className="border-muted-foreground/10">
              <CardContent className="p-6 md:p-8">
                <div className="space-y-8 text-sm md:text-base leading-relaxed text-muted-foreground">
                  {data.sections.map((section) => (
                    <section key={section.id} id={section.id} className="space-y-3">
                      <h2 className="text-base md:text-lg font-semibold text-foreground">
                        {section.title}
                      </h2>
                      {section.body.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </section>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium mb-1">{data.contactTitle}</p>
                <p className="text-sm text-muted-foreground max-w-xl">{data.contactText}</p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                <a
                  href="mailto:privacy@solutionmaxi.com"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  privacy@solutionmaxi.com
                </a>
                <Link href="/" className="text-xs text-muted-foreground hover:text-primary">
                  {data.backLabel}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
