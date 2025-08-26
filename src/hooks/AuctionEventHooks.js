// src/hooks/AuctionEventHooks.js

export async function afterCreate(createdItem, env) {
    if (!createdItem.event_code) {
        console.error('Event code is missing, cannot create event-specific files.');
        return;
    }

    const eventCode = createdItem.event_code;

    const filesToCreate = {
        [`sys-auction-events-${eventCode}.json`]: { events: [createdItem] },
        [`sys-auction-players-${eventCode}.json`]: { players: [] },
        [`sys-auction-teams-${eventCode}.json`]: { teams: [] }
    };

    const creationPromises = Object.entries(filesToCreate).map(([fileName, data]) => {
        const httpMetadata = { contentType: 'application/json' };
        return env.R2.put(fileName, JSON.stringify(data, null, 2), { httpMetadata })
            .then(() => console.log(`Successfully created file: ${fileName}`))
            .catch(error => console.error(`Failed to create file: ${fileName}`, error));
    });

    await Promise.all(creationPromises);
}
