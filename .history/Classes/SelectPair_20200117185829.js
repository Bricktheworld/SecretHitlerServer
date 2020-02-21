class SelectPair {
    constructor() {
        this.yay = 0;
        this.yayers = [];
        this.nay = 0;
        this.nayers = [];
        this.voteEnded = false;
        this.nominatedChancellor;
        this.prevPresident = null
    }

    pickPresident() {
        if (connectedPlayers.length == 0)
            return;
        currentPresientIndex++;
        if (currentPresientIndex >= connectedPlayers.length) {
            currentPresientIndex = 0;
        }
        currentPresident = connectedPlayers[currentPresientIndex];
        console.log("current president = " + currentPresident.username)
        io.sockets.emit('presidentVoting', currentPresident);
        this.requestPresidentChooseChancellor();
    }

    requestPresidentChooseChancellor() {
        if (currentChancellor == null && currentPresident != null) {
            io.to(currentPresident.id).emit('pickChancellor', 0);
            console.log(currentPresident.id);
        } else {
            let data = [currentChancellor.id];
            console.log("excluded: " + currentChancellor.id);
            if (connectedPlayers.length > 5 && excludedPresident != null) {
                data.push(excludedPresident.id)
                console.log("excluded president: " + excludedPresident.id);
            }
            io.to(currentPresident.id).emit('pickChancellor', data);
        }
    }

    requestNominatedPresidentChooseChancellor(player) {
        io.to(player.id).emit('pickChancellor', 0);
    }

    requestVoteOnPair(_chancellor) {
        this.voteEnded = false;
        this.yay = 0;
        this.nay = 0;
        this.yayers = [];
        this.nayers = [];
        this.nominatedChancellor = _chancellor;
        let data = [];
        data.push(currentPresident);
        data.push(this.nominatedChancellor);
        io.sockets.emit('vetoPair', data);
    }



    addNay(player) {
        if (this.voteEnded)
            return;
        this.nay++;
        this.nayers.push(player)
        if (this.nay + this.yay >= connectedPlayers.length) {
            console.log("vote Ended");
            this.endVote();
        }
        console.log(this.nay + ":" + this.yay + ":" + connectedPlayers.length);
    }
    addYay(player) {
        if (this.voteEnded)
            return;
        this.yay++;
        this.yayers.push(player);
        if (this.nay + this.yay >= connectedPlayers.length) {
            console.log("vote Ended");
            this.endVote();
        }
        console.log(this.nay + ":" + this.yay + ":" + connectedPlayers.length);
    }
    endVote() {
        this.voteEnded = true;
        let data = [[], [], []];
        data[0].push(currentPresident);
        data[0].push(this.nominatedChancellor);
        data[1] = this.nayers;
        data[2] = this.yayers
        console.log("num of yayers: " + this.yayers.length);

        if (this.yay > this.nay) {
            currentChancellor = this.nominatedChancellor;
            excludedPresident = currentPresident;
            console.log("excluding president " + excludedPresident.username);

            if (currentChancellor.id == hitler.id && fascistPolicies >= 3) {
                endGame(1)
                return;
            } else {
                console.log("end of game not triggered: Chancellor id = " + currentChancellor.id + ", hitler.id = " + hitler.id);
            }
            io.sockets.emit('pairWentThrough', data);
            setTimeout(runPolicyTurn, 5000);

        }
        else if (this.nay >= this.yay) {
            console.log("skip");
            io.sockets.emit('pairNotWentThrough', data);
            electionTracker++;
            io.sockets.emit('electionTrackerUpdate', electionTracker);
            if (checkElectionTracker())
                return;
            setTimeout(skipPair, 5000);
        }
        this.yayers = [];
        this.nayers = [];
    }
}

module.exports = SelectPair;