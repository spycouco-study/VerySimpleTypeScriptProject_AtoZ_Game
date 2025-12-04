class Game {
    // ... existing code ...

    private dropItem(gx: number, gy: number): void {
        if (Math.random() < this.settings.blockDropRate) {
            let totalRate = 0;
            for (const itemType in this.itemDropRates) {
                totalRate += this.itemDropRates[itemType];
            }

            let randomValue = Math.random() * totalRate;
            let currentSum = 0;

            for (const itemTypeString in this.itemDropRates) {
                const rate = this.itemDropRates[itemTypeString];
                currentSum += rate;
                if (randomValue <= currentSum) {
                    if (itemTypeString !== "no_item") {
                        // Fix: Directly use the string value from itemDropRates as ItemType
                        // Since ItemType is a string enum, its values are strings,
                        // which directly correspond to the image asset names.
                        const itemType = itemTypeString as ItemType; 
                        this.items.push(new Item(gx, gy, itemType, this.settings.tileSize, this.settings.itemLifespan));
                    }
                    return;
                }
            }
        }
    }

    // ... existing code ...
}