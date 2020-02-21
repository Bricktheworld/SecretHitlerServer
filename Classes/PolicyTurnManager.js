class PolicyTurnManager {
    constructor() {
        this.hand = [];
    }

    beginNewTurn() {
        this.hand = [];
        if (drawPolicies.length < 3) {
            console.log("ReShuffling Discard Back into Draw");
            drawPolicies = drawPolicies.concat(discardPolicies);
            discardPolicies = [];
            for (let i = 0; i < drawPolicies.length; i++) {
                console.log(drawPolicies[i]);
            }
        }
        for (let i = 0; i < 3; i++) {
            this.hand.push(drawPolicies[drawPolicies.length - 1]);
            drawPolicies.splice(drawPolicies.length - 1);
        }
        console.log(this.hand.length);
        io.to(currentPresident.id).emit('selectPolicies', this.hand);
    }

    removePolicy(i) {
        discardPolicies.push(this.hand[i]);
        this.hand.splice(i, 1);
        console.log(i);
        if (fascistPolicies >= 5) {
            io.sockets.emit('canVeto');
        }
        io.to(currentChancellor.id).emit('selectPolicies', this.hand);

    }

    placePolicy(i) {
        discardPolicies.push(this.hand[1 - i]);
        this.hand.splice(1 - i, 1);
        console.log("placed: " + this.hand[0]);
        switch (this.hand[0]) {
            case 0:
                liberalPolicies++;
                electionTracker = 0;
                io.sockets.emit("electionTrackerReset");
                io.sockets.emit('liberalPolicyUpdate');
                setTimeout(skipPair, 1500);
                break;
            case 1:
                fascistPolicies++;
                electionTracker = 0;
                io.sockets.emit("electionTrackerReset");
                io.sockets.emit('fascistPolicyUpdate');
                runSpecialAbilityCheck();
                break;
        }
        if (fascistPolicies >= 6) {
            endGame(1);
            return;
        } else if (liberalPolicies >= 5) {
            endGame(0);
            return;
        }


    }
    placePolicyAutoElectionTracker() {
        discardPolicies.push(drawPolicies[drawPolicies.length - 1]);
        let card = drawPolicies[drawPolicies.length - 1];
        drawPolicies.splice(drawPolicies.length - 1, 1);
        switch (card) {
            case 0:
                liberalPolicies++;
                io.sockets.emit('liberalPolicyUpdate');
                break;
            case 1:
                fascistPolicies++;
                io.sockets.emit('fascistPolicyUpdate');
                break;
        }

        if (fascistPolicies >= 6) {
            endGame(1);
            return;
        } else if (liberalPolicies >= 5) {
            endGame(0);
            return;
        } else {
            currentChancellor = null;
            excludedPresident = null;
            setTimeout(skipPair, 5000);
        }

    }
}

module.exports = PolicyTurnManager;