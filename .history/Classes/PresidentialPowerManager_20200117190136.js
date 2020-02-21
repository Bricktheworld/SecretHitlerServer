class PresidentialPowerManager {
    constructor() {
        this.killPlayerAbilityUnlocked = false;
        this.vetoCards = [];
    }

    examineTopThreeCards() {
        this.cards = [];
        if (drawPolicies.length < 3) {
            console.log("ReShuffling Discard Back into Draw");
            drawPolicies = drawPolicies.concat(discardPolicies);
            discardPolicies = [];
            for (let i = 0; i < drawPolicies.length; i++) {
                console.log(drawPolicies[i]);
            }
        }
        //who needs for loops
        this.cards.push(drawPolicies[drawPolicies.length - 1]);
        this.cards.push(drawPolicies[drawPolicies.length - 2]);
        this.cards.push(drawPolicies[drawPolicies.length - 3]);
        for (let i = 0; i < this.cards.length; i++) {
            console.log(this.cards[i]);
        }
        io.to(currentPresident.id).emit('examineTopThreeCards', this.cards);
        io.sockets.emit('presidentExaminingTopThreeCards', currentPresident);
        setTimeout(skipPair, 4000);
    }

    requestKillAPlayer() {
        console.log("kill a player");
        this.killPlayerAbilityUnlocked = true;
        io.to(currentPresident.id).emit('killPlayer');
        io.sockets.emit('presidentMustKillPlayer', currentPresident);
    }

    killPlayer(data) {
        let deadPlayer;
        for (let i = 0; i < connectedPlayers.length; i++) {
            if (data.id == connectedPlayers[i].id) {
                if (i < currentPresientIndex) {
                    currentPresientIndex--;
                }
                deadPlayer = connectedPlayers[i];
                deadPlayers.push(connectedPlayers[i]);
                console.log("dead players" + deadPlayers.length);
                connectedPlayers.splice(i, 1);
                console.log("Living Players" + connectedPlayers.length);

                console.log("Num Dead Players: " + deadPlayers.length);
                console.log("Num Living Players: " + connectedPlayers.length);
            }

        }

        if (deadPlayer == hitler && fascistPolicies >= 3) {
            endGame(0);
            return;
        }
        io.sockets.emit('killedPlayer', data);
        setTimeout(skipPair, 4000);
    }

    beginVeto(data) {
        this.vetoCards = data;
        io.sockets.emit('beganVeto', currentPresident.id);

        io.to(currentPresident.id).emit('decideVeto', data);
    }

    runVeto() {
        io.sockets.emit('VetoSuccess');
        console.log("discard policies before veto: " + discardPolicies.length);
        for (let i = 0; i < this.vetoCards.length; i++) {
            discardPolicies.push(this.vetoCards[i]);
        }
        console.log("discard policies after veto: " + discardPolicies.length);
        this.vetoCards = [];
        electionTracker++;
        io.sockets.emit('electionTrackerUpdate', electionTracker);
        checkElectionTracker();
        setTimeout(skipPair, 4000);
    }

    failVeto() {
        io.sockets.emit('failedVeto', currentPresident);
        console.log(policyTurnManager.hand);
        setTimeout(() => {
            io.to(currentChancellor.id).emit('failedVetoSelectPolicies', policyTurnManager.hand);
        }, 4000);
        this.vetoCards = [];
    }

    requestInvestigation() {
        if (excludedInvestigatedPlayer == null) {
            io.to(currentPresident.id).emit('examinePlayer', 0);
        } else {
            io.to(currentPresident.id).emit('examinePlayer', excludedInvestigatedPlayer);
        }
        io.sockets.emit('presidentMustExaminePlayer', currentPresident);
    }

    investigatePlayer(player) {
        for (let i = 0; i < connectedPlayers.length; i++) {
            if (player.id == connectedPlayers[i].id) {
                excludedInvestigatedPlayer = connectedPlayers[i];
                console.log("found player")
            }
        }
        io.to(currentPresident.id).emit('examinePlayerResults', player)
        setTimeout(skipPair, 4000);
    }

    beginSpecialElection() {
        io.sockets.emit('presidentChoosingCandidateForSpecialElection', currentPresident);
        io.to(currentPresident.id).emit('choosePlayerForSpecialElection');
        console.log("running special election");
    }

}