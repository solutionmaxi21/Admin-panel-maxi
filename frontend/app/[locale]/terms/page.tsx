"use client"

import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent } from "@/components/ui/card"

export default function TermsPage() {
  const { language } = useLanguage()

  const data =
    language === "ar"
      ? {
          title: "الشروط والأحكام",
          lastUpdated: "آخر تحديث: يناير 2026",
          intro:
            "باستخدامك لموقع Solutionmaxi وخدماته، فأنت توافق على هذه الشروط. نكتبها بشكل واضح ومختصر حتى تعرف بالضبط ما تتوقعه منا وما نتوقعه منك.",
          sections: [
            {
              id: "service",
              title: "1. من نحن وكيف يعمل الموقع",
              body: [
                "Solutionmaxi منصة جزائرية لبيع الأجهزة والمنتجات التقنية مع خدمة التوصيل لجميع الولايات الـ 58.",
                "الموقع مخصص للاستخدام الشخصي وضمن الإطار القانوني فقط. يجب أن يكون عمرك 18 سنة على الأقل لإجراء طلبات شراء."
              ]
            },
            {
              id: "orders",
              title: "2. الطلبات والدفع",
              body: [
                "تأكيد الطلب عبر الموقع لا يعني قبوله النهائي. قد نقوم بإلغاء أو تعديل الطلب في حال وجود خطأ في السعر أو توفر المنتج أو اشتباه في نشاط غير قانوني.",
                "طريقة الدفع الحالية هي الدفع عند الاستلام (COD). سيتم إضافة الدفع الإلكتروني لاحقاً وسيتم تحديث هذه الصفحة عند تفعيله."
              ]
            },
            {
              id: "delivery",
              title: "3. التوصيل",
              body: [
                "نعمل مع شركائنا في التوصيل (مثل Guepex و Yalidine) لتوصيل الطلبات إلى ولايات الجزائر الـ 58.",
                "الآجال المعروضة للتوصيل هي تقديرية. قد تتغير حسب الولاية، توفر المنتج، والظروف التشغيلية لشركات التوصيل."
              ]
            },
            {
              id: "returns",
              title: "4. الإرجاع والضمان",
              body: [
                "يجب فحص المنتج مع عامل التوصيل عند الاستلام. في حال وجود خطأ من طرفنا (مرجع خاطئ، منتج معيب عند الاستلام)، نتحمل تكاليف الإرجاع أو الاستبدال.",
                "تخضع معظم المنتجات لضمان المصنع من 1 إلى 3 سنوات حسب نوع المنتج والعلامة التجارية، مع ضرورة الاحتفاظ بوثائق الشراء."
              ]
            },
            {
              id: "responsibility",
              title: "5. حدود المسؤولية",
              body: [
                "نلتزم ببذل العناية المعقولة في تشغيل الموقع وتحضير الطلبات، لكننا لا نضمن عدم انقطاع الخدمة بشكل كامل أو خلوها من الأخطاء التقنية.",
                "لا نتحمل المسؤولية عن أي خسائر غير مباشرة أو تبعية مثل خسارة الأرباح أو البيانات الناتجة عن استخدام الموقع أو التأخير في التوصيل."
              ]
            },
            {
              id: "account",
              title: "6. الحسابات والاستخدام المسموح",
              body: [
                "أنت مسؤول عن صحة المعلومات المسجلة في حسابك وعن الحفاظ على سرية بيانات الدخول.",
                "يمنع استخدام الموقع لأي نشاط احتيالي، أو محاولة الدخول غير المصرح به، أو تعطيل الخدمة أو استخدامها بشكل يضر بنا أو بعملائنا."
              ]
            },
            {
              id: "changes",
              title: "7. تحديث الشروط والقانون المطبق",
              body: [
                "قد نقوم بتحديث هذه الشروط من وقت لآخر لتوافق التطورات التقنية أو القانونية أو التشغيلية. سنشير دائماً إلى تاريخ آخر تحديث في أعلى الصفحة.",
                "تخضع هذه الشروط لقوانين الجمهورية الجزائرية الديمقراطية الشعبية، وأي نزاع يختص به القضاء الجزائري."
              ]
            }
          ],
          contactTitle: "أسئلة حول الشروط؟",
          contactText:
            "إذا كان لديك أي استفسار حول هذه الشروط أو طريقة عمل الموقع، تواصل مع فريقنا القانوني عبر البريد الإلكتروني:",
          backLabel: "← العودة للرئيسية"
        }
      : {
          title: "Conditions Générales",
          lastUpdated: "Dernière mise à jour : janvier 2026",
          intro:
            "En utilisant le site et les services Solutionmaxi, vous acceptez ces conditions. Nous les présentons de manière claire et concise pour que vous sachiez exactement ce que nous vous offrons et ce que nous attendons de vous.",
          sections: [
            {
              id: "service",
              title: "1. Qui nous sommes et fonctionnement",
              body: [
                "Solutionmaxi est une plateforme algérienne spécialisée dans la vente de matériel et produits tech avec livraison dans les 58 wilayas.",
                "Le site est réservé à un usage légal et personnel. Vous devez avoir au moins 18 ans pour passer commande en votre nom."
              ]
            },
            {
              id: "orders",
              title: "2. Commandes et paiement",
              body: [
                "La confirmation de commande sur le site ne vaut pas acceptation définitive. Nous pouvons annuler ou ajuster une commande en cas d'erreur de prix, de disponibilité ou de suspicion d'activité frauduleuse.",
                "Le mode de paiement actuellement disponible est le paiement à la livraison (COD). Les paiements en ligne seront ajoutés plus tard et ces conditions seront mises à jour en conséquence."
              ]
            },
            {
              id: "delivery",
              title: "3. Livraison",
              body: [
                "Nous travaillons avec des partenaires de livraison (comme Guepex et Yalidine) pour couvrir les 58 wilayas.",
                "Les délais de livraison affichés sont indicatifs. Ils peuvent varier selon la wilaya, la disponibilité produit et les contraintes opérationnelles des transporteurs."
              ]
            },
            {
              id: "returns",
              title: "4. Retours et garantie",
              body: [
                "Vous devez vérifier le produit avec le livreur au moment de la réception. En cas d'erreur de notre part (mauvaise référence, produit défectueux à la réception), nous prenons en charge les frais de retour ou d'échange.",
                "La plupart des produits bénéficient d'une garantie constructeur de 1 à 3 ans selon la catégorie et la marque. La facture ou preuve d'achat est obligatoire pour toute demande de prise en charge."
              ]
            },
            {
              id: "responsibility",
              title: "5. Limitation de responsabilité",
              body: [
                "Nous mettons en œuvre des efforts raisonnables pour assurer le bon fonctionnement du site et la préparation de vos commandes, sans garantir une disponibilité continue ni l'absence totale d'erreurs.",
                "Solutionmaxi ne saurait être tenue responsable des pertes indirectes ou consécutives (perte de profit, de données, etc.) liées à l'utilisation du site ou aux retards de livraison."
              ]
            },
            {
              id: "account",
              title: "6. Comptes et usage autorisé",
              body: [
                "Vous êtes responsable de l'exactitude des informations de votre compte et de la confidentialité de vos identifiants.",
                "Toute utilisation frauduleuse, tentative d'accès non autorisée ou action visant à perturber le service est strictement interdite et pourra entraîner la suspension du compte."
              ]
            },
            {
              id: "changes",
              title: "7. Mise à jour des conditions et loi applicable",
              body: [
                "Nous pouvons mettre à jour ces conditions pour refléter des évolutions légales, techniques ou opérationnelles. La date de dernière mise à jour en haut de page indique la version en vigueur.",
                "Ces conditions sont régies par les lois de la République Algérienne Démocratique et Populaire. Tout litige relève de la compétence des tribunaux algériens."
              ]
            }
          ],
          contactTitle: "Questions sur les conditions ?",
          contactText:
            "Pour toute question sur ces conditions ou sur le fonctionnement du site, vous pouvez contacter notre équipe juridique par email :",
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
                  href="mailto:legal@solutionmaxi.com"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  legal@solutionmaxi.com
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
