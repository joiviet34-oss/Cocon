#!/usr/bin/env node
/**
 * Migration : shareId → collection shares + sous-collection members
 *
 * Pour chaque projet existant :
 *   - Crée shares/<ancien shareId>  role=editor  (les anciens liens ?share= continuent de fonctionner)
 *   - Crée shares/<nouveau UUID>    role=viewer
 *   - Supprime le champ shareId du document projet
 *
 * Usage :
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/migrate-shares.js
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/migrate-shares.js --apply
 *
 * Sans --apply : dry-run (lecture seule, affiche ce qui serait fait).
 * La clé de service ne doit JAMAIS être commitée dans le repo.
 */

'use strict';

const admin  = require('firebase-admin');
const crypto = require('crypto');

const DRY_RUN = !process.argv.includes('--apply');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Erreur : GOOGLE_APPLICATION_CREDENTIALS non défini.');
    console.error('Exportez la variable avant de lancer le script :');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/service-account.json');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'cocon-5a81e',
});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function migrate() {
    console.log('');
    console.log('='.repeat(60));
    console.log(`Migration shares — mode : ${DRY_RUN ? 'DRY-RUN (rien ne sera écrit)' : 'APPLY'}`);
    console.log('='.repeat(60));
    console.log('');

    const projectsSnap = await db.collection('projects').get();
    console.log(`Projets trouvés : ${projectsSnap.size}`);
    console.log('');

    let editorCreated = 0;
    let viewerCreated = 0;
    let fieldRemoved  = 0;
    let skipped       = 0;

    for (const projectDoc of projectsSnap.docs) {
        const data    = projectDoc.data();
        const pid     = projectDoc.id;
        const name    = data.name || '(sans nom)';
        const ownerId = data.ownerId;
        const shareId = data.shareId; // peut être absent si déjà migré

        console.log(`Projet : ${name} (${pid})`);

        if (!ownerId) {
            console.log('  ⚠  Pas de ownerId — ignoré');
            skipped++;
            continue;
        }

        // Vérifier les shares déjà existants pour ce projet
        const existingSnap = await db.collection('shares')
            .where('projectId', '==', pid)
            .get();
        const existingByRole = {};
        existingSnap.docs.forEach(d => {
            existingByRole[d.data().role] = d.id;
        });

        // Jeton editor : réutiliser l'ancien shareId pour préserver les liens existants
        if (existingByRole['editor']) {
            console.log(`  ~ editor déjà présent (${existingByRole['editor']}) — ignoré`);
            skipped++;
        } else if (shareId) {
            console.log(`  + shares/${shareId}  role=editor  (ancien lien conservé)`);
            if (!DRY_RUN) {
                await db.collection('shares').doc(shareId).set({
                    projectId: pid,
                    ownerId,
                    role: 'editor',
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            editorCreated++;
        } else {
            // Pas de shareId existant : générer un nouveau UUID
            const editorToken = crypto.randomUUID();
            console.log(`  + shares/${editorToken}  role=editor  (nouveau)`);
            if (!DRY_RUN) {
                await db.collection('shares').doc(editorToken).set({
                    projectId: pid,
                    ownerId,
                    role: 'editor',
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            editorCreated++;
        }

        // Jeton viewer : toujours un nouveau UUID
        if (existingByRole['viewer']) {
            console.log(`  ~ viewer déjà présent (${existingByRole['viewer']}) — ignoré`);
            skipped++;
        } else {
            const viewerToken = crypto.randomUUID();
            console.log(`  + shares/${viewerToken}  role=viewer`);
            if (!DRY_RUN) {
                await db.collection('shares').doc(viewerToken).set({
                    projectId: pid,
                    ownerId,
                    role: 'viewer',
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            viewerCreated++;
        }

        // Supprimer le champ shareId du document projet
        if (shareId !== undefined) {
            console.log(`  - projects/${pid}.shareId supprimé`);
            if (!DRY_RUN) {
                await db.collection('projects').doc(pid).update({
                    shareId: FieldValue.delete(),
                });
            }
            fieldRemoved++;
        } else {
            console.log(`  ~ shareId déjà absent`);
        }

        console.log('');
    }

    console.log('='.repeat(60));
    console.log('Résumé');
    console.log('='.repeat(60));
    console.log(`  Jetons editor créés  : ${editorCreated}`);
    console.log(`  Jetons viewer créés  : ${viewerCreated}`);
    console.log(`  Champs shareId retirés : ${fieldRemoved}`);
    console.log(`  Ignorés (déjà traités) : ${skipped}`);

    if (DRY_RUN) {
        console.log('');
        console.log('Mode dry-run : aucune écriture effectuée.');
        console.log('Relancez avec --apply pour appliquer la migration.');
    } else {
        console.log('');
        console.log('Migration appliquée.');
    }
}

migrate().catch(err => {
    console.error('Erreur fatale :', err.message || err);
    process.exit(1);
});
