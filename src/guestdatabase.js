let secrets;
let logger;

async function initialize(_secrets, _logger) {
  secrets = _secrets;
  logger = _logger;
}

async function sendUpsertRequest(confirmationCodeResponses) {
  const requestObject = [];
  for (const response of confirmationCodeResponses) {
    const upsertObject = mapConfirmationCodeResponseToUpsertRequest(response.data, response.code);
    if (upsertObject) {
      requestObject.push(upsertObject);
    }
  }
  if (requestObject.length === 0) {
    logger.info('No reservations to upsert.');
    return;
  }
  const response = await postJson(secrets.guestDatabaseUrl + '/stays/upsert', requestObject);
  if (!response.ok) {
    throw `Guest database upsert failed with status ${response.status}`;
  }
  logger.info(`Guest database upsert succeeded for ${requestObject.length} reservation(s).`);
}

function mapConfirmationCodeResponseToUpsertRequest(response, code) {
  if (!response) {
    logger.warn(`${code}: empty response, skipping.`);
    return null;
  }
  const bookings = response.bookings ?? [];
  if (bookings.length === 0) {
    logger.warn(`${code}: no bookings, skipping.`);
    return null;
  }
  const checkIn = bookings.map(b => b.startDate).sort()[0];
  const checkOut = bookings.map(b => b.endDate).sort().at(-1);
  const lineItems = bookings.flatMap(b =>
      b.lineItems.map(item => ({
        type: item.description,
        name: item.description === 'Room' ? (b.room?.name ?? item.description) : item.description,
        quantity: item.quantity,
        amount: item.actualAmount.toFixed(2),
        date: item.billingDate
      }))
  );
  const allItemizedTaxes = bookings.flatMap(b => b.lineItems.flatMap(i => i.itemizedTaxes ?? []));
  const sumTax = id => allItemizedTaxes
      .filter(t => t.id === id)
      .reduce((sum, t) => sum + t.taxAmount, 0)
      .toFixed(2);
  const getAttr = name => response.attributeValues?.find(a => a.attribute.variableName === name)?.value || null;
  const customer = response.customer;
  const phones = [customer.phone, customer.cellPhone, customer.workPhone]
      .filter(Boolean)
      .map(number => ({ number }));
  return {
    externalId: parseInt(response.id),
    confirmationCode: response.confirmationId,
    primaryGuestName: customer.fullName,
    status: response.status === 'canceled' ? 'CANCELED' : 'SCHEDULED',
    checkIn,
    checkOut,
    additionalGuestName: response.additionalGuestNames || null,
    arrivalTime: response.arrivalTime || null,
    dietaryRestrictions: response.dietaryRestrictions || null,
    specialAccommodations: response.specialAccommodations || null,
    housekeepingNotes: getAttr('housekeeping_notes'),
    reasonForStay: getAttr('reason_for_stay'),
    invoice: {
      items: lineItems,
      stateTax: sumTax(secrets.taxIds.state),
      countyTax: sumTax(secrets.taxIds.county)
    },
    guest: {
      externalId: parseInt(customer.id),
      name: customer.fullName,
      notes: customer.notes || null,
      phones,
      emails: customer.email ? [{ address: customer.email }] : [],
      addresses: customer.streetAddress ? [{
        street: customer.streetAddress,
        city: customer.locality,
        state: customer.region,
        zip: customer.postalCode,
        country: customer.country
      }] : []
    }
  };
}

async function getConfirmationCodesWithoutGuest() {
  const url = `${secrets.guestDatabaseUrl}/stays/without-guest`;
  const response = await fetch(url, { headers: { 'Authorization': basicAuthHeader() } });
  if (!response.ok) {
    throw `Guest database GET /stays/without-guest failed with status ${response.status}`;
  }
  const stays = await response.json();
  return stays.filter(s => s.guest === null).map(s => s.confirmationCode).filter(Boolean);
}

async function getGuestHistory(guestId) {
  const url = `${secrets.guestDatabaseUrl}/guests/${guestId}/history`;
  const response = await fetch(url, { headers: { 'Authorization': basicAuthHeader() } });
  if (!response.ok) {
    throw `Guest database GET /guests/${guestId}/history failed with status ${response.status}`;
  }
  return response.json();
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${secrets.guestDatabaseUser}:${secrets.guestDatabasePassword}`).toString('base64');
}

async function postJson(url, body) {
  logger.info(`Sending upsert request with ${body.length} stays.`);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': basicAuthHeader()
    },
    body: JSON.stringify(body)
  });
}

export {
  initialize,
  sendUpsertRequest,
  getConfirmationCodesWithoutGuest,
  getGuestHistory
}