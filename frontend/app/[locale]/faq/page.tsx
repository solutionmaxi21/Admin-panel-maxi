"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/lib/language-context"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export default function FAQPage() {
  const { language } = useLanguage()

  const localT = {
    fr: {
      title: "Questions Fréquemment Posées",
      intro: "Trouvez des réponses aux questions courantes sur nos produits, commandes, livraisons, et plus encore.",
      sections: {
        orders: "Commandes & Paiement",
        shipping: "Expédition & Livraison",
        returns: "Retours & Garantie",
        products: "Produits & Stock",
        account: "Compte & Sécurité"
      },
      questions: {
        order1: { q: "Comment passer une commande ?", a: "Parcourez notre boutique, ajoutez des articles à votre panier et passez à la caisse. Vous devrez créer un compte ou vous connecter, fournir les informations de livraison et choisir votre méthode de paiement. Nous acceptons actuellement le paiement à la livraison (COD)." },
        order2: { q: "Quels moyens de paiement acceptez-vous ?", a: "Nous acceptons actuellement le Paiement à la Livraison (COD). Les paiements en ligne par carte bancaire seront disponibles très bientôt. Le paiement à la livraison est sécurisé et traité conformément aux normes de protection des données." },
        order3: { q: "Puis-je annuler ou modifier ma commande ?", a: "Vous pouvez annuler votre commande si elle n'a pas encore été traitée. Pour modifier votre commande (items, quantité, adresse), il n'existe pas de système de modification en ligne - vous devez annuler votre commande actuelle et en créer une nouvelle avec les bonnes informations. Une fois la commande expédiée, l'annulation n'est plus possible, mais vous pouvez la retourner conformément à notre politique de retour." },
        order4: { q: "Comment suivre ma commande ?", a: "Après avoir passé votre commande, vous pouvez la suivre depuis la section \"Mes Commandes\" de votre compte. Vous verrez des mises à jour en temps réel sur le statut de votre commande : en attente, en traitement, expédiée et livrée." },
        ship1: { q: "Offrez-vous la livraison gratuite ?", a: "Oui ! Nous offrons la livraison gratuite sur toutes les commandes de plus de 50 000 DZD. Pour les commandes inférieures à ce montant, des frais de livraison standard de 2 000 DZD s'appliquent." },
        ship2: { q: "Combien de temps prend la livraison ?", a: "Les délais estimés varient selon l'emplacement : Alger (1-2 jours), Grandes villes (2-4 jours), Autres régions (3-7 jours). Ces estimations dépendent de nos partenaires de livraison. Vous recevrez les informations de suivi en temps réel une fois votre commande expédiée." },
        ship3: { q: "Livrez-vous dans toutes les villes d'Algérie ?", a: "Oui, nous livrons dans les 58 wilayas d'Algérie. Les zones reculées peuvent connaître des délais de livraison légèrement plus longs." },
        return1: { q: "Quelle est votre politique de retour ?", a: "À la réception de votre commande, vérifiez le produit directement avec le livreur avant de l'accepter. Si vous constatez une erreur (produit incorrect, défaut) ou un dommage, signalez-le immédiatement. Important : vous ne pouvez pas vous éloigner avec la commande avant de payer. En cas d'erreur de notre part ou de défaut du produit, nous organisons un échange gratuit : un livreur viendra vous apporter le produit correct et reprendra l'article défectueux sans frais. Cependant, si vous avez commandé le mauvais produit, les frais de livraison de l'échange restent à votre charge." },
        return2: { q: "Comment fonctionnent les garanties ?", a: "À la réception, si vous découvrez un défaut ou une erreur de notre part, signalez-le immédiatement au livreur. Nous procédons à un échange gratuit : un livreur viendra récupérer l'article défectueux et vous livrera le produit correct, sans frais. Chaque produit dispose de garanties constructeur (1-3 ans selon le produit). Conservez votre facture comme preuve d'achat." },
        return3: { q: "Que faire si mon produit arrive endommagé ?", a: "Si vous constatez un dommage ou un défaut à la réception, signalez-le immédiatement au livreur. Important : ne vous éloignez pas avec le colis avant d'avoir vérifié le produit. Nous procéderons à un remplacement gratuit sans frais supplémentaires. Contactez-nous avec votre numéro de commande et le livreur organisera le remplacement dès que possible." },
        prod1: { q: "Tous les produits sont-ils authentiques ?", a: "Nous travaillons exclusivement avec des distributeurs et fabricants autorisés pour sourcer nos produits. Tous les articles vendus sur notre plateforme sont conformes aux normes de qualité. En cas de doute sur l'authenticité d'un produit reçu, contactez-nous immédiatement avec photos et numéro de commande." },
        prod2: { q: "Quand les articles en rupture de stock seront-ils disponibles ?", a: "Les délais de réapprovisionnement varient selon le produit et le fournisseur. Pour connaître la disponibilité estimée, consultez la page produit ou envoyez-nous un email à support@solutionmaxi.com avec le nom du produit pour obtenir une date de réapprovisionnement approximative." },
        prod3: { q: "Offrez-vous un support technique ?", a: "Oui ! Nous sommes disponibles pour vous aider à choisir les bons produits. Pour toute question ou demande de support, envoyez-nous un email à support@solutionmaxi.com avec votre demande détaillée et votre numéro de commande si applicable. Nous nous efforçons de répondre à tous les emails." },
        acc1: { q: "Ai-je besoin d'un compte pour passer commande ?", a: "Oui, un compte est requis pour passer des commandes. Créer un compte vous permet de suivre vos commandes, enregistrer vos adresses, consulter votre historique de commandes et gérer votre liste de souhaits." },
        acc2: { q: "Mes informations personnelles sont-elles sécurisées ?", a: "Absolument. Nous utilisons un cryptage conforme aux normes de l'industrie pour protéger vos informations personnelles et de paiement. Nous ne partageons jamais vos données avec des tiers sans votre consentement. Lisez notre Politique de Confidentialité pour plus de détails." },
        acc3: { q: "Comment réinitialiser mon mot de passe ?", a: "Cliquez sur \"Mot de passe oublié\" sur la page de connexion, entrez votre adresse email, et nous vous enverrons les instructions pour réinitialiser votre mot de passe. Si vous ne recevez pas l'email, vérifiez votre dossier spam ou contactez le support." },
        stillHaveQuestions: "Vous avez encore des questions ?",
        contactSupport: "Contactez notre équipe de support",
        happyToHelp: "et nous serons ravis de vous aider !"
      }
    },
    ar: {
      title: "الأسئلة الشائعة",
      intro: "اعثر على إجابات للأسئلة الشائعة حول منتجاتنا، طلباتنا، التوصيل، والمزيد.",
      sections: {
        orders: "الطلبات والدفع",
        shipping: "الشحن والتوصيل",
        returns: "الإرجاع والضمان",
        products: "المنتجات والمخزون",
        account: "الحساب والأمان"
      },
      questions: {
        order1: { q: "كيف يمكنني تقديم طلب؟", a: "تصفح متجرنا، أضف المنتجات إلى سلة التسوق، واتجه للدفع. ستحتاج إلى إنشاء حساب أو تسجيل الدخول، تقديم معلومات التوصيل، واختيار طريقة الدفع. نقبل حاليا الدفع عند الاستلام (COD)." },
        order2: { q: "ما هي طرق الدفع المقبولة؟", a: "نقبل حاليا الدفع عند الاستلام (COD). سيكون الدفع الإلكتروني عبر البطاقة البنكية متاحا قريبا جدا. الدفع عند الاستلام آمن ويتم معالجته وفقا لمعايير حماية البيانات." },
        order3: { q: "هل يمكنني إلغاء أو تعديل طلبي؟", a: "يمكنك إلغاء طلبك إذا لم تتم معالجته بعد. للتعديل على طلبك (المنتجات أو الكمية أو العنوان)، لا يوجد نظام تعديل مباشر - يجب عليك إلغاء الطلب الحالي وإنشاء طلب جديد بالبيانات الصحيحة. بمجرد شحن الطلب، لا يمكن إلغاؤه، لكن يمكنك إرجاعه وفقا لسياسة الإرجاع الخاصة بنا." },
        order4: { q: "كيف يمكنني تتبع طلبي؟", a: "بعد تقديم طلبك، يمكنك تتبعه من قسم \"طلباتي\" في حسابك. سترى تحديثات في الوقت الفعلي لحالة طلبك: قيد الانتظار، قيد المعالجة، تم الشحن، وتم التوصيل." },
        ship1: { q: "هل توفرون شحناً مجانياً؟", a: "نعم! نقدم شحناً مجانياً لجميع الطلبات التي تزيد عن 50,000 دج. للطلبات الأقل من هذا المبلغ، تطبق رسوم شحن قياسية قدرها 2,000 دج." },
        ship2: { q: "كم يستغرق التوصيل؟", a: "تختلف أوقات التوصيل المقدرة حسب الموقع: الجزائر العاصمة (1-2 يوم عمل)، المدن الكبرى (2-4 أيام عمل)، المناطق الأخرى (3-7 أيام عمل). هذه التقديرات تعتمد على شركائنا في التوصيل. ستتلقى معلومات التتبع الفعلية بمجرد شحن طلبك." },
        ship3: { q: "هل تشحنون لجميع المدن في الجزائر؟", a: "نعم، نقوم بالشحن إلى جميع الولايات الـ 58 في الجزائر. قد تستغرق المناطق النائية وقتاً أطول قليلاً في التوصيل." },
        return1: { q: "ما هي سياسة الإرجاع الخاصة بكم؟", a: "عند استلام طلبك، تحقق من المنتج مع موظف التوصيل قبل قبول الطلب. إذا اكتشفت خطأ (منتج خاطئ، عيب) أو ضرر، أبلغ عنه فورًا. مهم: لا يمكنك الابتعاد بالطلب قبل الدفع. إذا كان الخطأ من جانبنا أو كان المنتج به عيب، نقدم تبديل مجاني: سيأتي موظف توصيل لإحضار المنتج الصحيح واستعادة المنتج التالف دون أي تكاليف إضافية. إذا طلبت المنتج الخاطئ، تكاليف التوصيل للتبديل تبقى على عاتقك." },
        return2: { q: "كيف يعمل الضمان؟", a: "عند الاستلام، إذا اكتشفت عيب في المنتج أو خطأ من جانبنا، أبلغ عنه فورًا لموظف التوصيل. نقدم تبديل مجاني: سيأتي موظف توصيل لاستعادة المنتج التالف وتوصيل المنتج الصحيح، بدون تكاليف. كل منتج له ضمان من المصنع (1-3 سنوات حسب المنتج). احفظ فاتورتك كدليل على الشراء." },
        return3: { q: "ماذا لو وصل منتجي تالفاً؟", a: "إذا اكتشفت ضرر أو عيب عند الاستلام، أبلغ عنه فورًا لموظف التوصيل. مهم: لا تبتعد بالطلب قبل التحقق من المنتج. نقدم استبدال مجاني بدون أي تكاليف إضافية. اتصل بنا برقم طلبك وسينظم موظف التوصيل الاستبدال في أقرب وقت." },
        prod1: { q: "هل جميع المنتجات أصلية؟", a: "نعمل بشكل حصري مع الموزعين والمصنعين المرخصين. جميع المنتجات المباعة على منصتنا تتوافق مع معايير الجودة. في حالة الشك في أصالة منتج استقبلته، اتصل بنا فورا مع صور ورقم طلبك." },
        prod2: { q: "متى ستتوفر المنتجات غير المتوفرة؟", a: "أوقات إعادة التخزين تختلف حسب المنتج والموردين. للحصول على معلومات عن توفر المنتج، راجع صفحة المنتج أو أرسل لنا بريد على support@solutionmaxi.com مع اسم المنتج للحصول على تاريخ إعادة تخزين تقريبي." },
        prod3: { q: "هل توفرون دعما فنيا؟", a: "نعم! نحن متاحون لمساعدتك في اختيار المنتجات المناسبة. لأي سؤال أو طلب دعم، أرسل لنا بريد على support@solutionmaxi.com مع تفاصيل طلبك ورقم طلبك إن أمكن. نحرص على الرد على جميع رسائل البريد الإلكتروني." },
        acc1: { q: "هل أحتاج إلى حساب لتقديم طلب؟", a: "نعم، يلزم وجود حساب لتقديم الطلبات. يتيح لك إنشاء حساب تتبع طلباتك، حفظ عناوينك، عرض سجل طلباتك، وإدارة قائمة رغباتك." },
        acc2: { q: "هل معلوماتي الشخصية آمنة؟", a: "بالتأكيد. نستخدم تشفيراً متفقاً عليه صناعياً لحماية معلوماتك الشخصية ومعلومات الدفع. لا نشارك بياناتك أبداً مع أطراف ثالثة دون موافقتك. اقرأ سياسة الخصوصية الخاصة بنا لمزيد من التفاصيل." },
        acc3: { q: "كيف يمكنني إعادة تعيين كلمة المرور؟", a: "انقر على \"نسيت كلمة المرور\" في صفحة تسجيل الدخول، أدخل بريدك الإلكتروني، وسنرسل لك تعليمات لإعادة تعيين كلمة المرور. إذا لم تتلقَ البريد الإلكتروني، تحقق من مجلد الرسائل غير المرغوب فيها أو اتصل بالدعم." },
        stillHaveQuestions: "لا تزال لديك أسئلة؟",
        contactSupport: "تواصل مع فريق الدعم",
        happyToHelp: "وسنكون سعداء بمساعدتك!"
      }
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-6">{txt.title}</h1>
            <p className="text-lg text-muted-foreground mb-12">
              {txt.intro}
            </p>

            <div className="space-y-8">
              {/* Orders & Payment */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.sections.orders}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.order1.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.order1.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.order2.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.order2.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.order3.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.order3.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.order4.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.order4.a}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              {/* Shipping & Delivery */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.sections.shipping}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="ship-1">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.ship1.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.ship1.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="ship-2">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.ship2.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.ship2.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="ship-3">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.ship3.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.ship3.a}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              {/* Returns & Warranty */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.sections.returns}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="return-1">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.return1.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.return1.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="return-2">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.return2.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.return2.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="return-3">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.return3.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.return3.a}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              {/* Products & Stock */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.sections.products}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="prod-1">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.prod1.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.prod1.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="prod-2">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.prod2.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.prod2.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="prod-3">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.prod3.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.prod3.a}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              {/* Account */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.sections.account}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="acc-1">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.acc1.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.acc1.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="acc-2">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.acc2.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.acc2.a}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="acc-3">
                      <AccordionTrigger className="text-left rtl:text-right">{txt.questions.acc3.q}</AccordionTrigger>
                      <AccordionContent className="text-left rtl:text-right">
                        {txt.questions.acc3.a}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-8 bg-muted/50">
              <CardContent className="py-6">
                <p className="text-center text-muted-foreground">
                  {txt.questions.stillHaveQuestions}{" "}
                  <Link href="/contact" className="text-primary hover:underline font-medium">
                    {txt.questions.contactSupport}
                  </Link>
                  {" "}{txt.questions.happyToHelp}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
