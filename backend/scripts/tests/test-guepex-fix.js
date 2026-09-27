
import guepexShipmentService from './src/services/guepex-shipment.js';

async function testFix() {
    console.log('Testing findCommuneByName with "Algiers"...');
    try {
        const commune = await guepexShipmentService.findCommuneByName('Alger Centre', 'Algiers');
        if (commune) {
            console.log('SUCCESS: Found commune:', commune);
        } else {
            console.error('FAILURE: Commune not found');
        }
    } catch (error) {
        console.error('ERROR:', error);
    }
}

testFix();
