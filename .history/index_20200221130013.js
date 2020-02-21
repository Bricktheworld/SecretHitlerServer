const SelectPair = require('./Classes/SelectPair.js')
const PolicyTurnManager = require('./Classes/PolicyTurnManager.js')
const PresidentialPowerManager = require('./Classes/PresidentialPowerManager.js')
const Player = require('./Classes/Player.js');

const express = require('express');
const app = express();
const shortid = require('shortid')

// Set up the server
// process.env.PORT is related to deploying on heroku
const server = app.listen(process.env.PORT || 80, listen);

// This call back just tells us that the server has started
function listen() {
    const host = server.address().address;
    const port = server.address().port;
    console.log('Example app listening at http://' + host + ':' + port);
}

app.use(express.static('public'));


// WebSocket Portion
// WebSockets work with the HTTP server
const io = require('socket.io')(server);

//actual game, barely anymore networking
const LIBERAL = 0;
const FASCIST = 1;
const HITLER = 2;
const roles = [LIBERAL, LIBERAL, LIBERAL, FASCIST, HITLER];
const extraRoles =
    [[LIBERAL],
    [LIBERAL, FASCIST],
    [LIBERAL, LIBERAL, FASCIST],
    [LIBERAL, LIBERAL, FASCIST, FASCIST],
    [LIBERAL, LIBERAL, LIBERAL, FASCIST, FASCIST]];



let lobbies = [];

let callbacks = [];


class Game {
    constructor(gamePin, owner, ownerID, name, numberOfPlayers, dataObject) {
        this.gamePin = gamePin;
        this.owner = owner;
        this.ownerID = ownerID;
        this.name = name;
        this.numberOfPlayers = numberOfPlayers;
        this.dataObject = dataObject;
        this.roomname = gamePin;

        this.connectedPlayers = [{ name: owner, id: ownerID, spectator: false, dead: false }]
        this.livingPlayers = [];
        this.deadPlayers = [];
        this.fascists = [];
        this.liberals = [];
        this.hitler;


        this.currentPresientIndex = -1;
        this.currentPresident;
        this.currentChancellor;

        this.gameStarted = false;

        this.electionTracker = 0;

        this.expectedLength = 5;

        this.excludedPresident = null;
        this.excludedInvestigatedPlayer = null;

        this.policies = [];
        this.discardPolicies = [];
        this.drawPolicies = [];

        this.liberalPolicies = 0;
        this.fascistPolicies = 0;
    }

    addUser(data) {
        console.log("new user: " + data.name)
        this.connectedPlayers.push(data)
        io.to(this.roomname).emit('update players in lobby', this.connectedPlayers)
        io.to(this.ownerID).emit('update ability to join game', this.connectedPlayers.length >= this.numberOfPlayers)
    }

    disconnectUser(data) {
        for (let i = 0; i < this.connectedPlayers.length; i++) {
            if (this.connectedPlayers[i].id == data) {
                this.connectedPlayers.splice(i, 1);
                io.to(this.roomname).emit('update players in lobby', this.connectedPlayers)
                if (this.ownerID == data && this.connectedPlayers.length > 0) {
                    this.reassignOwner()
                } else if (this.connectedPlayers.length <= 0) {
                    lobbies.splice(lobbies.indexOf(this), 1);
                    io.sockets.emit('sync lobbies', lobbies)
                }
                io.to(this.ownerID).emit('update ability to join game', this.connectedPlayers.length >= this.numberOfPlayers)
                return;
            }
        }
    }

    reassignOwner() {
        let indexOfNewOwner = Math.floor(Math.random() * this.connectedPlayers.length)
        this.owner = this.connectedPlayers[indexOfNewOwner].name;
        this.ownerID = this.connectedPlayers[indexOfNewOwner].id;
        io.to(this.roomname).emit('update owner', { owner: this.owner, ownerID: this.ownerID })
    }

    renamelobby(name) {
        this.name = name
        io.to(this.roomname).emit('update lobby name', this.name)
    }
    updatePlayerCount(value) {
        this.numberOfPlayers = value;
        io.to(this.roomname).emit('update player count', this.numberOfPlayers);
        io.to(this.ownerID).emit('update ability to join game', this.connectedPlayers.length >= this.numberOfPlayers)
    }


    startGame() {
        this.livingPlayers = [];
        this.deadPlayers = [];
        this.fascists = [];
        this.liberals = [];
        this.hitler;


        this.currentPresientIndex = -1;
        this.currentPresident;
        this.currentChancellor;

        this.gameStarted = false;

        this.electionTracker = 0;

        this.expectedLength = 5;

        this.excludedPresident = null;
        this.excludedInvestigatedPlayer = null;

        this.policies = [];
        this.discardPolicies = [];
        this.drawPolicies = [];

        this.liberalPolicies = 0;
        this.fascistPolicies = 3;
        this.gameStarted = true;
        this.roles = shuffleArray(this.numberOfPlayers > 5 ? roles.concat(extraRoles[this.numberOfPlayers - 6]) : roles);
        this.livingPlayers = this.connectedPlayers
        for (let i = 0; i < this.livingPlayers.length; i++) {
            this.livingPlayers[i].role = this.roles[i]
            io.to(this.livingPlayers[i].id).emit('assign role', (this.livingPlayers[i].role))
            if (this.roles[i] == FASCIST) {
                this.fascists.push(this.livingPlayers[i])
            } else if (this.roles[i] == HITLER) {
                this.hitler = this.livingPlayers[i]
            }
        }
        this.livingPlayers = shuffleArray(this.livingPlayers)

        this.initDeck();
        io.to(this.roomname).emit('start game', this.livingPlayers);
        setTimeout(() => {
            for (let i = 0; i < this.livingPlayers.length; i++) {
                io.to(this.livingPlayers[i].id).emit('role sync', this.livingPlayers[i].role)
                if (this.livingPlayers[i].role == 1) {
                    io.to(this.livingPlayers[i].id).emit('role reveal sync fascists', { fascists: this.fascists, hitler: this.hitler })
                } else if (this.livingPlayers[i].role == 2 && this.numberOfPlayers <= 6) {
                    io.to(this.livingPlayers[i].id).emit('role reveal sync hitler', this.fascists)
                }
            }
        }, 100)
        setTimeout(() => {
            this.pickPresident();
        }, 500)

    }
    initDeck() {
        this.policies = [];
        for (let i = 0; i < 11; i++) {
            this.policies.push({ value: 1, id: shortid.generate() });
        }

        for (let i = 0; i < 6; i++) {
            this.policies.push({ value: 0, id: shortid.generate() });
        }
        this.drawPolicies = shuffleArray(this.policies);
        for (let i = 0; i < this.drawPolicies.length; i++) {
            console.log(this.drawPolicies[i]);
        }
    }

    pickPresident() {
        this.yay = 0;
        this.yayers = [];
        this.nay = 0;
        this.nayers = [];
        this.voteEnded = false;
        this.nominatedChancellor;
        this.prevPresident = null;
        if (this.livingPlayers.length == 0)
            return;
        this.currentPresientIndex++;
        if (this.currentPresientIndex >= this.livingPlayers.length) {
            this.currentPresientIndex = 0;
        }
        this.currentPresident = this.livingPlayers[this.currentPresientIndex];
        console.log("current president: " + this.currentPresident.name)
        io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' is choosing a chancellor', excluded: [this.currentPresident.id] });
        this.requestPresidentChooseChancellor();
    }

    requestPresidentChooseChancellor() {
        let cloneArr = this.livingPlayers.slice(0);
        if (this.currentChancellor == null && this.currentPresident != null) {
            cloneArr.splice(cloneArr.indexOf(this.currentPresident), 1)
        } else {
            cloneArr.splice(cloneArr.indexOf(this.currentPresident), 1)
            for (let i = 0; i < cloneArr.length; i++) {
                if (cloneArr[i].id == this.currentChancellor.id) {
                    cloneArr.splice(i, 1)
                    console.log("excluded chancellor: " + cloneArr[i].name);
                }
            }
            if (this.livingPlayers.length > 5 && this.excludedPresident != null) {
                for (let i = 0; i < cloneArr.length; i++) {
                    if (cloneArr[i].id == this.excludedPresident.id) {
                        cloneArr.splice(i, 1)
                        console.log("excluded President: " + cloneArr[i].name);
                    }
                }
            }
        }
        let callbackID = shortid.generate()
        callbacks[callbackID] = (data) => { this.requestVoteOnPair(data) };
        io.to(this.currentPresident.id).emit('pick chancellor', { data: cloneArr, callback: callbackID, title: 'You are president, please choose a chancellor' });
    }
    requestNominatedPresidentChooseChancellor(player) {
        let possibleChancellors = this.livingPlayers.slice(0);



        for (let i = 0; i < possibleChancellors.length; i++) {
            if (player.id == possibleChancellors[i].id) {
                this.currentPresident = possibleChancellors[i]
                possibleChancellors.splice(i, 1)
            }
        }
        let callbackID = shortid.generate();
        callbacks[callbackID] = (data) => {
            io.to(this.currentPresident.id).emit('action task completed')
            this.requestVoteOnPair(data)
        }
        io.to(this.currentPresident.id).emit('pick chancellor', { data: possibleChancellors, callback: callbackID, title: 'You have been chosen as president for a special election, choose a chancellor' });
        io.to(this.roomname).emit('waiting event', { title: 'President chose ' + this.currentPresident.name + ' to be president', excluded: this.currentPresident.id })
    }

    requestVoteOnPair(data) {
        this.voteEnded = false;
        this.yay = 0;
        this.nay = 0;
        this.yayers = [];
        this.nayers = [];
        this.nominatedChancellor = data;
        let candidates = [];
        candidates.push(this.currentPresident);
        candidates.push(this.nominatedChancellor);
        let callbackID = shortid.generate()
        callbacks[callbackID] = (data) => {

            console.log(data.id)
            let player
            for (let i = 0; i < this.livingPlayers.length; i++) {
                if (this.livingPlayers[i].id == data.id) {
                    player = this.livingPlayers[i]
                    console.log('found player by name: ' + this.livingPlayers[i].name + ' ' + player.name)
                }
            }
            if (player == null) {
                console.log('unable to find player');
                return;
            }
            if (data.value == 0) {
                this.addYay(player);
            } else {
                this.addNay(player);
            }
        }
        io.to(this.roomname).emit('veto pair', { title: 'Please vote on President ' + this.currentPresident.name + ' and Chancellor ' + this.nominatedChancellor.name, callback: callbackID });
    }

    addNay(player) {
        io.to(player.id).emit('action task completed')
        if (this.voteEnded)
            return;
        io.to(player.id).emit('action bar task completed')
        this.nay++;
        this.nayers.push(player)
        if (this.nay + this.yay >= this.livingPlayers.length) {
            console.log("vote Ended");
            this.endVote();
        } else {
            io.to(player.id).emit('waiting event', { title: 'Waiting on other players to vote', excluded: 'none' })
        }
    }
    addYay(player) {
        io.to(player.id).emit('action task completed')
        if (this.voteEnded)
            return;
        this.yay++;
        this.yayers.push(player);
        if (this.nay + this.yay >= this.livingPlayers.length) {
            console.log("vote Ended");
            this.endVote();
        } else {
            io.to(player.id).emit('waiting event', { title: 'Waiting on other players to vote', excluded: 'none' })
        }
    }
    endVote() {
        this.voteEnded = true;
        let data = [[], [], []];
        data[0].push(this.currentPresident.name);
        data[0].push(this.nominatedChancellor.name);
        data[1] = this.nayers;
        data[2] = this.yayers

        if (this.yay > this.nay) {
            this.currentChancellor = this.nominatedChancellor;
            this.excludedPresident = this.currentPresident;
            console.log("excluding president " + this.excludedPresident.name);

            if (this.currentChancellor.id == this.hitler.id && this.fascistPolicies >= 3) {
                this.endGame('Fascists win, Hitler elected Chancellor')
                return;
            } else {
            }

            io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' and Chancellor ' + this.currentChancellor.name + ' were elected', excluded: 'none' });
            io.to(this.roomname).emit('vote ended results', { title: 'President ' + this.currentPresident.name + ' and Chancellor ' + this.currentChancellor.name + ' were elected', data: { yayers: this.yayers, nayers: this.nayers } })
            console.log(this.drawPolicies.length)
            setTimeout(() => { this.beginNewTurn() }, 3000);

        }
        else if (this.nay >= this.yay) {
            console.log("skip");
            io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' and Chancellor ' + this.nominatedChancellor.name + ' were not elected', excluded: 'none' });
            this.electionTracker++;
            io.to(this.roomname).emit('election tracker update', this.electionTracker);
            if (this.checkElectionTracker())
                return;
            setTimeout(() => { this.pickPresident() }, 5000);
        }
        this.yayers = [];
        this.nayers = [];
    }
    checkElectionTracker() {
        if (this.electionTracker >= 3) {
            this.placePolicyAutoElectionTracker();
            this.electionTracker = 0;
            io.to(this.roomname).emit('waiting event', { title: 'election tracker reached max', excluded: 'none' });
            return true;
        }
        return false;
    }

    beginNewTurn() {

        this.hand = [];
        if (this.drawPolicies.length < 3) {
            this.drawPolicies = this.drawPolicies.concat(this.discardPolicies);
            this.discardPolicies = [];
        }
        for (let i = 0; i < 3; i++) {
            this.hand.push(this.drawPolicies[this.drawPolicies.length - 1]);
            this.drawPolicies.splice(this.drawPolicies.length - 1);
        }
        let callbackID = shortid.generate()
        callbacks[callbackID] = (data) => { this.discardPolicy(data); console.log("discard policy: " + data.id) }
        io.to(this.currentPresident.id).emit('president discard policy', { data: this.hand, title: 'Please select a policy to discard', callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'Waiting on President to choose a policy to discard', excluded: this.currentPresident.id })
    }

    discardPolicy(data) {
        let i;
        for (let j = 0; j < this.hand.length; j++) {
            if (this.hand[j].id == data.id) {
                i = j;
            }
        }
        this.discardPolicies.push(this.hand[i]);
        this.hand.splice(i, 1);
        let callbackID = shortid.generate();
        callbacks[callbackID] = (data) => { this.placePolicy(data) }
        io.to(this.currentPresident.id).emit('action task completed')
        io.to(this.currentChancellor.id).emit('chancellor place policy', { data: this.hand, title: 'Please select a policy to place', callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'Waiting on Chancellor to choose a policy to place', excluded: this.currentChancellor.id })
    }

    placePolicy(data) {
        let i;
        for (let j = 0; j < this.hand.length; j++) {
            if (this.hand[j].id == data.id) {
                i = j;
                console.log('place policy: ' + this.hand[j])
            }
        }
        this.discardPolicies.push(this.hand[1 - i]);
        this.hand.splice(1 - i, 1);
        io.to(this.currentChancellor.id).emit('action task completed')
        switch (this.hand[0].value) {
            case 0:
                this.liberalPolicies++;
                this.electionTracker = 0;
                io.to(this.roomname).emit("election tracker update", this.electionTracker);
                io.to(this.roomname).emit('policy board update', { liberalPolicies: this.liberalPolicies, fascistPolicies: this.fascistPolicies });
                setTimeout(() => { this.pickPresident() }, 1500);
                break;
            case 1:
                this.fascistPolicies++;
                this.electionTracker = 0;
                io.to(this.roomname).emit("election tracker update", this.electionTracker);
                io.to(this.roomname).emit('policy board update', { liberalPolicies: this.liberalPolicies, fascistPolicies: this.fascistPolicies });
                this.runSpecialAbilityCheck();
                break;
        }
        if (this.fascistPolicies >= 6) {
            io.to(this.roomname).emit('game over', { title: 'Fascists win', reason: '6 fascists policies were placed' })
            this.endGame('Fascists win! 6 fascist policies placed');
            return;
        } else if (this.liberalPolicies >= 5) {
            io.to(this.roomname).emit('game over', { title: 'Liberals win', reason: '5 liberal policies were placed' })
            this.endGame('Liberals win! 5 fascist policies placed');
            return;
        }


    }
    placePolicyAutoElectionTracker() {
        this.discardPolicies.push(this.drawPolicies[this.drawPolicies.length - 1]);
        let card = this.drawPolicies[this.drawPolicies.length - 1];
        this.drawPolicies.splice(this.drawPolicies.length - 1, 1);
        switch (card.value) {
            case 0:
                this.liberalPolicies++;
                io.to(this.roomname).emit('policy board update', { liberalPolicies: this.liberalPolicies, fascistPolicies: this.fascistPolicies });
                break;
            case 1:
                this.fascistPolicies++;
                io.to(this.roomname).emit('policy board update', { liberalPolicies: this.liberalPolicies, fascistPolicies: this.fascistPolicies });
                break;
        }

        if (this.fascistPolicies >= 6) {
            this.endGame('Fascists win! 6 fascist policies placed');
            return;
        } else if (this.liberalPolicies >= 5) {
            this.endGame('Liberals win! 5 liberal policies placed');
            return;
        } else {
            this.currentChancellor = null;
            this.excludedPresident = null;
            setTimeout(() => { this.pickPresident() }, 5000);
        }

    }

    requestKillAPlayer() {
        this.killPlayerAbilityUnlocked = true;
        let listOfPossiblePlayers = [];
        this.livingPlayers.forEach(player => {
            if (player.id == this.currentPresident.id)
                return;
            listOfPossiblePlayers.push({ name: player.name, id: player.id })
        });
        let callbackID = shortid.generate()
        callbacks[callbackID] = (data) => {
            io.to(this.currentPresident.id).emit('action task completed');
            this.killPlayer(data)
        }
        io.to(this.currentPresident.id).emit('kill player', { data: listOfPossiblePlayers, title: 'You must kill a player', callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'President must kill a player', excluded: this.currentPresident.id });
    }

    killPlayer(data) {
        let deadPlayer;
        for (let i = 0; i < this.livingPlayers.length; i++) {
            if (data.id == this.livingPlayers[i].id) {
                if (i < this.currentPresientIndex) {
                    this.currentPresientIndex--;
                }
                deadPlayer = this.livingPlayers[i];
                this.deadPlayers.push(this.livingPlayers[i]);
                console.log("dead players" + this.deadPlayers.length);
                this.livingPlayers.splice(i, 1);
                console.log("Living Players" + this.livingPlayers.length);
                console.log('connected players: ' + this.connectedPlayers.length)

                console.log("Num Dead Players: " + this.deadPlayers.length);
                console.log("Num Living Players: " + this.livingPlayers.length);
            }

        }

        if (deadPlayer == this.hitler && this.fascistPolicies >= 3) {
            this.endGame('Liberals win! Hitler was killed');
            return;
        }
        io.to(this.roomname).emit('waiting event', { title: this.currentPresident.name + ' killed ' + deadPlayer.name, excluded: 'none' });
        io.to(deadPlayer.id).emit('you were killed')
        io.to(this.roomname).emit('update players', this.livingPlayers);
        setTimeout(() => { this.pickPresident() }, 4000);
    }

    requestInvestigation() {
        let investigatablePlayers = this.livingPlayers.slice(0)
        for (let i = 0; i < investigatablePlayers.length; i++) {
            if (investigatablePlayers[i].id == this.currentPresident.id) {
                investigatablePlayers.splice(i, 1);
            } else if (this.excludedInvestigatedPlayer != null && investigatablePlayers[i].id == this.excludedInvestigatedPlayer.id) {
                investigatablePlayers.splice(i, 1);
            }
        }
        let callbackID = shortid.generate();
        callbacks[callbackID] = (data) => {
            io.to(this.currentPresident.id).emit('action task completed')
            this.investigatePlayer(data);
        }
        io.to(this.currentPresident.id).emit('investigate player', { title: 'examine player', data: investigatablePlayers, callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'President must choose a player to investigate', excluded: this.currentPresident });
    }

    investigatePlayer(data) {
        let player;
        for (let i = 0; i < this.livingPlayers.length; i++) {
            if (data.id == this.livingPlayers[i].id) {
                this.excludedInvestigatedPlayer = this.livingPlayers[i];
                player = this.livingPlayers[i]
            }
        }
        let role = "OOPSIE WOOPSIE!! Uwu We make a fucky wucky!! A wittle fucko boingo! The code monkeys at our headquarters are working VEWY HAWD to fix this!";
        if (player.role == 0) {
            role = "Liberal";
        } else if (player.role == 1 || player.role == 2) {
            role = "Fascist";
        }
        io.to(this.currentPresident.id).emit('waiting event', { title: player.name + "'s role is " + role, excluded: 'none' })
        io.to(this.roomname).emit('waiting event', { title: this.currentPresident.name + " is investigating " + player.name, excluded: this.currentPresident.id })
        setTimeout(() => { this.pickPresident() }, 4000);
    }

    beginSpecialElection = () => {
        let possiblePresidents = this.livingPlayers.slice(0)
        for (let i = 0; i < possiblePresidents.length; i++) {
            if (possiblePresidents[i].id == this.currentPresident.id) {
                possiblePresidents.splice(i, 1);
                break;
            }
        }
        let callbackID = shortid.generate();
        callbacks[callbackID] = (data) => {
            io.to(this.currentPresident.id).emit('action task completed')
            this.requestNominatedPresidentChooseChancellor(data);
        }
        io.to(this.currentPresident.id).emit('special election', { title: 'Choose a president for a special election', data: possiblePresidents, callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'President must choose a player for a special election', excluded: this.currentPresident.id })
    }

    runSpecialAbilityCheck() {
        if (this.numberOfPlayers == 5 || this.numberOfPlayers == 6) {
            switch (this.fascistPolicies) {
                case 3:
                    setTimeout(() => { this.examineTopThreeCards() }, 3000);
                    break;
                case 4:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                case 5:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                default:
                    setTimeout(() => { this.pickPresident() }, 1500);
                    break;
            }
        } else if (this.numberOfPlayers == 7 || this.numberOfPlayers == 8) {
            switch (this.fascistPolicies) {
                case 2:
                    setTimeout(() => { this.requestInvestigation() }, 3000);
                    break;
                case 3:
                    setTimeout(() => { this.beginSpecialElection() }, 3000);
                    break;
                case 4:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                case 5:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                default:
                    setTimeout(() => { this.pickPresident() }, 1500);
                    break;
            }
        } else if (this.numberOfPlayers == 9 || this.numberOfPlayers == 10) {
            switch (this.fascistPolicies) {
                case 1:
                    setTimeout(() => { this.requestInvestigation() }, 3000);
                    break;
                case 2:
                    setTimeout(() => { this.requestInvestigation() }, 3000);
                    break;
                case 3:
                    setTimeout(() => { this.beginSpecialElection() }, 3000);
                    break;
                case 4:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                case 5:
                    setTimeout(() => { this.requestKillAPlayer() }, 3000);
                    break;
                default:
                    setTimeout(() => { this.pickPresident() }, 1500);
                    break;
            }
        }

    }
    examineTopThreeCards() {
        this.cards = [];
        if (this.drawPolicies.length < 3) {
            console.log("ReShuffling Discard Back into Draw");
            this.drawPolicies = this.drawPolicies.concat(discardPolicies);
            this.discardPolicies = [];
        }
        //who needs for loops
        this.cards.push(this.drawPolicies[this.drawPolicies.length - 1]);
        this.cards.push(this.drawPolicies[this.drawPolicies.length - 2]);
        this.cards.push(this.drawPolicies[this.drawPolicies.length - 3]);
        io.to(this.currentPresident.id).emit('examine top three cards', { data: this.cards, title: 'These are the top 3 cards in the deck UwU' });
        io.to(this.roomname).emit('waiting event', { title: 'President is examining the top 3 cards', excluded: this.currentPresident.id });
        setTimeout(() => { this.pickPresident() }, 4000);
    }

    returnToLobby() {
        io.to(this.roomname).emit('joined lobby', this)
        io.to(this.ownerID).emit('update ability to start game', this.connectedPlayers.length >= this.numberOfPlayers)
        this.gameStarted = false;
    }

    endGame(title) {
        io.to(this.roomname).emit('game over', { title: title, fascists: this.fascists, hitler: this.hitler })
        setTimeout(() => { this.returnToLobby() }, 5000)
    }
}

io.sockets.on('connection', function (socket) {
    let loggedIn = false;
    let username;
    let currentLobby = null;
    let id = socket.id;
    socket.emit('connectedToServer', socket.id);

    socket.on('login', (data) => {
        console.log("User Logged in: " + data)
        loggedIn = true;
        username = data;
        socket.emit('successfully logged in', id);
        socket.emit('sync lobbies', lobbies)
    })

    socket.on('request join lobby', (data) => {
        for (let i = 0; i < lobbies.length; i++) {
            if (lobbies[i].gamePin === data && lobbies[i].livingPlayers.length < lobbies[i].numberOfPlayers && !lobbies[i].gameStarted) {
                socket.emit('joined lobby', lobbies[i]);
                socket.join(lobbies[i].roomname)
                currentLobby = lobbies[i];
                currentLobby.addUser({ name: username, id: id, role: -1, spectator: false })
                return;
            } else {
                socket.emit('failed to join lobby');
                return;
            }
        }
        console.log("nonexistent lobby: " + data)
        socket.emit('unable to join lobby');
    })

    socket.on('request leave lobby', () => {
        if (currentLobby == null)
            return;
        currentLobby.disconnectUser(id)
        socket.leave(currentLobby.roomname);
        currentLobby = null;
        socket.emit('disconnected from lobby')
        setTimeout(() => { socket.emit('sync lobbies', lobbies) }, 10)
    })

    socket.on('create lobby', data => {
        console.log("Lobby: " + data.name);
        let lobby = new Game(data.gamePin, data.owner, id, data.name, 5);
        lobbies.push(lobby);
        currentLobby = lobby;
        socket.join(lobby.roomname)
        io.sockets.emit('sync lobbies', lobbies)
        socket.emit('joined lobby', lobby);
    })

    socket.on('request game start', data => {
        if (currentLobby.ownerID != id || currentLobby.connectedPlayers.length < currentLobby.numberOfPlayers)
            return;
        currentLobby.startGame();
    });

    socket.on('update player count', data => {
        if (id == currentLobby.ownerID) {
            currentLobby.updatePlayerCount(data)
        }
    })

    socket.on('disconnect', () => {
        if (currentLobby != null) {
            currentLobby.disconnectUser(id);
        }
    })

    socket.on('callback request', (data) => {
        callbacks[data.callback](data.data)
    })
});





//stolen code from stackoverflow
function shuffleArray(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}