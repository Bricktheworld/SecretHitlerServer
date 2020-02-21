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

        this.connectedPlayers = [{ name: owner, id: ownerID, role: -1, spectator: false, dead: false, }];
        this.deadPlayers = [];
        this.fascists = [];
        this.liberals = [];
        this.hitler;


        this.currentPresientIndex = -1;
        this.currentPresident;
        this.currentChancellor;

        this.gameOver = false;
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

        this.selectPair = new SelectPair();
        this.policyTurnManager = new PolicyTurnManager();
        this.presidentialPowerManager = new PresidentialPowerManager();


    }

    addUser(data) {
        console.log("new user: " + data.name)
        this.connectedPlayers.push(data)
        io.to(this.roomname).emit('update players in lobby', this.connectedPlayers)
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
    }


    startGame() {
        this.gameStarted = true;
        this.roles = shuffleArray(this.numberOfPlayers > 5 ? roles.concat(extraRoles[this.numberOfPlayers - 6]) : roles);
        for (let i = 0; i < this.connectedPlayers.length; i++) {
            this.connectedPlayers[i].role = this.roles[i]
            io.to(this.connectedPlayers[i].id).emit('assign role', (this.connectedPlayers[i].role))
            if (this.roles[i] == FASCIST) {
                this.fascists.push(this.connectedPlayers[i])
            } else if (this.roles[i] == HITLER) {
                this.hitler = this.connectedPlayers[i]
            }
        }
        this.connectedPlayers = shuffleArray(this.connectedPlayers)

        this.initDeck();
        io.to(this.roomname).emit('start game', this.connectedPlayers);
        setTimeout(() => {
            for (let i = 0; i < this.connectedPlayers.length; i++) {
                io.to(this.connectedPlayers[i].id).emit('role sync', this.connectedPlayers[i].role)
                if (this.connectedPlayers[i].role == 1) {
                    io.to(this.connectedPlayers[i].id).emit('role reveal sync fascists', { fascists: this.fascists, hitler: this.hitler })
                } else if (this.connectedPlayers[i].role == 2 && this.numberOfPlayers <= 6) {
                    io.to(this.connectedPlayers[i].id).emit('role reveal sync hitler', this.fascists)
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
        if (this.connectedPlayers.length == 0)
            return;
        this.currentPresientIndex++;
        if (this.currentPresientIndex >= this.connectedPlayers.length) {
            this.currentPresientIndex = 0;
        }
        this.currentPresident = this.connectedPlayers[this.currentPresientIndex];
        console.log("current president: " + this.currentPresident.name)
        io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' is choosing a chancellor', excluded: [this.currentPresident.id] });
        this.requestPresidentChooseChancellor();
    }

    requestPresidentChooseChancellor() {
        let cloneArr = this.connectedPlayers.slice(0);
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
            if (this.connectedPlayers.length > 5 && this.excludedPresident != null) {
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
            for (let i = 0; i < this.connectedPlayers.length; i++) {
                if (this.connectedPlayers[i].id == data.id) {
                    player = this.connectedPlayers[i]
                    console.log('found player by name: ' + this.connectedPlayers[i].name + ' ' + player.name)
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
        if (this.nay + this.yay >= this.connectedPlayers.length) {
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
        if (this.nay + this.yay >= this.connectedPlayers.length) {
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
                // this.endGame(1)
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
            io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' and Chancellor ' + this.currentChancellor.name + ' were not elected', excluded: 'none' });
            this.electionTracker++;
            io.to(this.roomname).emit('election tracker update', this.electionTracker);
            // if (this.checkElectionTracker())
            //     return;
            // setTimeout(skipPair, 5000);
        }
        this.yayers = [];
        this.nayers = [];
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
                io.to(this.roomname).emit('liberal policy board update', this.liberalPolicies);
                setTimeout(() => { this.pickPresident() }, 1500);
                break;
            case 1:
                this.fascistPolicies++;
                this.electionTracker = 0;
                io.to(this.roomname).emit("election tracker update", this.electionTracker);
                io.to(this.roomname).emit('fascist policy board update', this.fascistPolicies);
                this.runSpecialAbilityCheck();
                break;
        }
        if (this.fascistPolicies >= 6) {
            io.to(this.roomname).emit('game over', { title: 'Fascists win', reason: '6 fascists policies were placed' })
            // endGame(1);
            return;
        } else if (this.liberalPolicies >= 5) {
            io.to(this.roomname).emit('game over', { title: 'Liberals win', reason: '5 liberal policies were placed' })
            // endGame(0);
            return;
        }


    }

    requestKillAPlayer() {
        this.killPlayerAbilityUnlocked = true;
        let listOfPossiblePlayers = [];
        this.connectedPlayers.forEach(player => {
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
        for (let i = 0; i < this.connectedPlayers.length; i++) {
            if (data.id == this.connectedPlayers[i].id) {
                if (i < this.currentPresientIndex) {
                    this.currentPresientIndex--;
                }
                deadPlayer = this.connectedPlayers[i];
                this.deadPlayers.push(this.connectedPlayers[i]);
                console.log("dead players" + this.deadPlayers.length);
                this.connectedPlayers.splice(i, 1);
                console.log("Living Players" + this.connectedPlayers.length);

                console.log("Num Dead Players: " + this.deadPlayers.length);
                console.log("Num Living Players: " + this.connectedPlayers.length);
            }

        }

        if (deadPlayer == this.hitler && this.fascistPolicies >= 3) {
            // endGame(0);
            return;
        }
        io.to(this.roomname).emit('waiting event', { title: this.currentPresident.name + ' killed ' + deadPlayer.name, excluded: 'none' });
        io.to(deadPlayer.id).emit('you were killed')
        io.to(this.roomname).emit('update players', this.connectedPlayers);
        setTimeout(() => { this.pickPresident() }, 4000);
    }

    requestInvestigation() {
        let investigatablePlayers = this.connectedPlayers.slice(0)
        if (this.excludedInvestigatedPlayer != null) {
            for (i = 0; i < investigatablePlayers.length; i++) {
                if (investigatablePlayers[i].id == this.excludedInvestigatedPlayer)
                    investigatablePlayers.splice(i, 1);
            }
        }
        let callbackID = shortid.generate();
        callbacks[callbackID] = (data) => {
            this.investigatePlayer(data);
        }
        io.to(this.currentPresident.id).emit('investigate player', { title: 'examine player', data: investigatablePlayers, callback: callbackID });
        io.to(this.roomname).emit('waiting event', { title: 'President must choose a player to investigate', excluded: this.currentPresident });
    }

    investigatePlayer(data) {
        let player;
        for (let i = 0; i < connectedPlayers.length; i++) {
            if (data.id == connectedPlayers[i].id) {
                excludedInvestigatedPlayer = connectedPlayers[i];
                player = this.connectedPlayers[i]
            }
        }
        let role = "unable to retrieve role";
        if (player.role == 0) {
            role = "Liberal";
        } else if (player.role == 1 || player.role == 2) {
            role = "Fascist";
        }
        io.to(this.currentPresident.id).emit('waiting event', { title: player.name + "'s role is " + role, excluded: 'none' })
        io.to(this.roomname).emit('waiting event', { title: this.currentPresident.name + " is investigating " + player.name, excluded: this.currentPresident.id })
        setTimeout(() => { this.pickPresident() }, 4000);
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
                    setTimeout(presidentialPowerManager.beginSpecialElection, 3000);
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
        } else if (expectedLength == 9 || expectedLength == 10) {
            switch (fascistPolicies) {
                case 1:
                    setTimeout(presidentialPowerManager.requestInvestigation, 3000);
                    break;
                case 2:
                    setTimeout(presidentialPowerManager.requestInvestigation, 3000);
                    break;
                case 3:
                    setTimeout(presidentialPowerManager.beginSpecialElection, 3000);
                    break;
                case 4:
                    setTimeout(presidentialPowerManager.requestKillAPlayer, 3000);
                    break;
                case 5:
                    setTimeout(presidentialPowerManager.requestKillAPlayer, 3000);
                    break;
                default:
                    setTimeout(skipPair, 1500);
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
            if (lobbies[i].gamePin === data && lobbies[i].connectedPlayers.length < lobbies[i].numberOfPlayers && !lobbies[i].gameStarted) {
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

    // socket.on('requestHitler', () => {
    //     console.log(socket.id + " requested Hitler");
    //     if (player.team == 1 || player.team == 2) {
    //         socket.emit('hitlerPlayer', hitler);
    //         console.log(socket.id + " request accepted");
    //     } else {
    //         console.log(socket.id + " request denied, team: " + player.team);
    //     }
    // });

    // socket.on('requestFascist', () => {
    //     if (player.team == 1 || player.team == 2) {
    //         socket.emit('fascistPlayers', this.fascists);
    //     }
    // })

    socket.on('selectedChancellor', (data) => {
        console.log("selected Possible Chancellor: " + data.id);
        this.selectPair.requestVoteOnPair(data);
    })
    socket.on('requestKillPlayer', (data) => {
        console.log("killing player: " + data.id);
        this.presidentialPowerManager.killPlayer(data);
    })

    socket.on('removedPolicy', (data) => {
        this.policyTurnManager.removePolicy(data);
    })

    socket.on('policyChosen', (data) => {
        this.policyTurnManager.placePolicy(data);
    })

    socket.on('requestVeto', (data) => {
        console.log(data.length);
        this.presidentialPowerManager.beginVeto(data);
    })
    socket.on('vetoOrNot', (data) => {
        switch (data) {
            case 0:
                this.selectPair.addNay(player);
                break;
            case 1:
                this.selectPair.addYay(player);
                break;
        }
    })

    socket.on('vetoed', () => {
        console.log("VETOED!");
        this.presidentialPowerManager.runVeto();
    })
    socket.on('noVetoed', () => {
        console.log("Not VETOED!");
        this.presidentialPowerManager.failVeto();
    })

    socket.on('killedSelf', () => {
        console.log("Killed self, no longer checking disconnect");
        checkDisconnect = false;
    })

    socket.on('selectedPresident', (data) => {
        this.currentPresident = data;
        this.selectPair.requestNominatedPresidentChooseChancellor(data);
    })

    socket.on('selectedPlayerToInvestigate', (data) => {
        this.presidentialPowerManager.investigatePlayer(data);
    })
});





//stolen code lol
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

// function init() {
//     this.liberalPolicies = 0;
//     this.fascistPolicies = 0;
//     this.gameOver = false;
//     gameStarted = true;
//     io.sockets.emit('gameStart');
//     console.log("Game begin")
//     this.selectPair.pickPresident();
// }

// function skipPair() {
//     this.selectPair = new this.selectPair();
//     this.selectPair.pickPresident();

// }

// function runPolicyTurn() {
//     this.policyTurnManager = new this.policyTurnManager();
//     this.policyTurnManager.beginNewTurn();
//     console.log("Policy Turn");
// }



// function runSpecialAbilityCheck() {
//     console.log("testing");
//     if (this.expectedLength == 5 || this.expectedLength == 6) {
//         switch (this.fascistPolicies) {
//             case 3:
//                 setTimeout(this.presidentialPowerManager.examineTopThreeCards, 3000);
//                 break;
//             case 4:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             case 5:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             default:
//                 setTimeout(skipPair, 1500);
//                 break;
//         }
//     } else if (this.expectedLength == 7 || this.expectedLength == 8) {
//         switch (this.fascistPolicies) {
//             case 2:
//                 setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
//                 break;
//             case 3:
//                 setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
//                 break;
//             case 4:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             case 5:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             default:
//                 setTimeout(skipPair, 1500);
//                 break;
//         }
//     } else if (this.expectedLength == 9 || this.expectedLength == 10) {
//         switch (this.fascistPolicies) {
//             case 1:
//                 setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
//                 break;
//             case 2:
//                 setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
//                 break;
//             case 3:
//                 setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
//                 break;
//             case 4:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             case 5:
//                 setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
//                 break;
//             default:
//                 setTimeout(skipPair, 1500);
//                 break;
//         }
//     }

// }

// function checkElectionTracker() {
//     if (electionTracker >= 3) {
//         this.policyTurnManager.placePolicyAutoElectionTracker();
//         electionTracker = 0;
//         io.sockets.emit('ElectionTrackerReachMax');
//         return true;
//     }
//     return false;
// }

// function endGame(winner) {
//     this.gameOver = true;
//     io.sockets.emit('this.gameOver', [winner, hitler, this.fascists]);
//     this.connectedPlayers = [];
//     this.deadPlayers = [];
//     hitler = null;
//     this.liberals = [];
//     this.fascists = [];
//     this.possibleRoles = shuffleArray(roles);
//     this.policies = [];
//     this.discardPolicies = [];
//     this.drawPolicies = [];
//     gameStarted = false;

//     this.liberalPolicies = 0;
//     this.fascistPolicies = 0;

//     this.currentPresientIndex = 0;
//     this.currentPresident = null;
//     currentChancellor = null;

//     this.lobbyCreated = false;

//     this.expectedLength = 5;


//     this.excludedPresident = null;
//     this.excludedInvestigatedPlayer = null;

//     electionTracker = 0;

//     this.selectPair = new this.selectPair();
//     this.policyTurnManager = new this.policyTurnManager();
//     this.presidentialPowerManager = new this.presidentialPowerManager();
// }

