/**
 * Add Arabic Translations Script
 * This script adds common Arabic translations to the bilingual database fields
 * 
 * Usage: node add-arabic-translations.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common translations for categories
const categoryTranslations = {
    'Serveurs': 'الخوادم',
    'Ordinateurs portables': 'أجهزة الكمبيوتر المحمولة',
    'Pc Portable': 'حاسوب محمول',
    'PC Gamer': 'حاسوب ألعاب',
    'PC Professionnel': 'حاسوب مهني',
    'MacBook': 'ماك بوك',
    'Ordinateurs de bureau': 'أجهزة الكمبيوتر المكتبية',
    'PC Bureau Gaming': 'حاسوب مكتبي للألعاب',
    'PC Bureau Professionnel': 'حاسوب مكتبي مهني',
    'Mini PC': 'حاسوب مصغر',
    'Composants': 'المكونات',
    'Cartes Graphiques': 'بطاقات الرسومات',
    'Processeurs': 'المعالجات',
    'Mémoire RAM': 'ذاكرة الوصول العشوائي',
    'Stockage': 'التخزين',
    'Disques Durs': 'الأقراص الصلبة',
    'SSD': 'أقراص SSD',
    'Périphériques': 'الأجهزة الطرفية',
    'Claviers': 'لوحات المفاتيح',
    'Souris': 'الفأرة',
    'Écrans': 'الشاشات',
    'Casques': 'سماعات الرأس',
    'Webcams': 'كاميرات الويب',
    'Imprimantes': 'الطابعات',
    'Réseaux': 'الشبكات',
    'Routeurs': 'أجهزة التوجيه',
    'Switches': 'أجهزة التبديل',
    'Câbles': 'الكابلات',
    'Accessoires': 'الملحقات',
    'Sacs & Sacoches': 'الحقائب',
    'Supports': 'الحوامل',
    'Tapis de souris': 'حصيرة الفأرة'
};

// Common translations for product attributes
const attributeTranslations = {
    'Processeur': 'المعالج',
    'RAM': 'ذاكرة الوصول العشوائي',
    'Écran': 'الشاشة',
    'Carte Graphique': 'بطاقة الرسومات',
    'Stockage': 'التخزين',
    'Système d\'exploitation': 'نظام التشغيل',
    'Batterie': 'البطارية',
    'Poids': 'الوزن',
    'Connectivité': 'الاتصال',
    'Clavier': 'لوحة المفاتيح',
    'Webcam': 'كاميرا الويب',
    'Audio': 'الصوت',
    'Ports': 'المنافذ',
    'Dimensions': 'الأبعاد',
    'Garantie': 'الضمان',
    'Couleur': 'اللون',
    'Mémoire': 'الذاكرة',
    'Type': 'النوع',
    'Vitesse': 'السرعة',
    'Capacité': 'السعة',
    'Interface': 'الواجهة',
    'Résolution': 'الدقة',
    'Taille': 'الحجم',
    'Fréquence': 'التردد',
    'Chipset': 'شريحة',
    'Socket': 'المقبس'
};

// Common translations for promotions
const promotionTranslations = {
    'Promotion Gaming': 'عرض الألعاب',
    'Remise Professionnels 20%': 'خصم 20% للمهنيين',
    'Bienvenue Algérie': 'مرحباً بالجزائر',
    'Flash Sale': 'تخفيضات سريعة'
};

// Database path - relative to backend folder
const DB_PATH = path.join(__dirname, '..', '..', '..', 'database');

function updateTranslations(filePath, fieldMappings) {
    const fullPath = path.join(DB_PATH, filePath);

    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ File not found: ${fullPath}`);
        return 0;
    }

    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    let updated = 0;

    data.forEach(item => {
        Object.entries(fieldMappings).forEach(([fieldName, translations]) => {
            if (item[fieldName] && typeof item[fieldName] === 'object') {
                const frValue = item[fieldName].fr;
                if (frValue && translations[frValue] && !item[fieldName].ar) {
                    item[fieldName].ar = translations[frValue];
                    updated++;
                }
            }
        });
    });

    if (updated > 0) {
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
        console.log(`✅ Updated ${updated} translations in ${filePath}`);
    } else {
        console.log(`ℹ️ No new translations needed for ${filePath}`);
    }

    return updated;
}

function main() {
    console.log('🌍 Adding Arabic Translations...\n');

    let totalUpdated = 0;

    // Update categories
    totalUpdated += updateTranslations('catalog/categories.json', {
        category_name: categoryTranslations,
        description: categoryTranslations // Descriptions often contain category name
    });

    // Update product attributes
    totalUpdated += updateTranslations('catalog/product-attributes.json', {
        attribute_name: attributeTranslations
    });

    // Update promotions
    totalUpdated += updateTranslations('promotions/promotions.json', {
        promotion_name: promotionTranslations
    });

    console.log(`\n✅ Done! Total fields updated: ${totalUpdated}`);
}

main();
