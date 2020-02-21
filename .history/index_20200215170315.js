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

        this.connectedPlayers = [{ name: owner, id: ownerID, role: -1, spectator: false, }];
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
        for (let i = 0; i < this.connectedPlayers.length; i++) {
            console.log(this.connectedPlayers[i].name + ":" + this.connectedPlayers[i].role)
        }
        io.to(this.roomname).emit('start game', this.connectedPlayers);
        setTimeout(() => {
            this.pickPresident();
        }, 250)

    }

    pickPresident() {
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
            cloneArr.splice(this.connectedPlayers.indexOf(this.currentPresident), 1)
        } else {
            cloneArr.splice(this.connectedPlayers.indexOf(this.currentPresident), 1)
            cloneArr.splice(this.connectedPlayers.indexOf(this.currentChancellor), 1)
            console.log("excluded chancellor: " + this.currentChancellor.id);
            if (this.connectedPlayers.length > 5 && this.excludedPresident != null) {
                cloneArr.splice(this.connectedPlayers.indexOf(this.excludedPresident), 1)
                console.log("excluded president: " + this.excludedPresident.id);
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
        if (this.voteEnded)
            return;
        this.nay++;
        this.nayers.push(player)
        if (this.nay + this.yay >= this.connectedPlayers.length) {
            console.log("vote Ended");
            this.endVote();
        } else {
            io.to(player.id).emit('waiting event', { title: 'Waiting on other players to vote', excluded: 'none' })
            console.log('waiting')
        }
        console.log(this.yay + ":" + this.nay + ":" + this.connectedPlayers.length);
    }
    addYay(player) {
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
        console.log(this.yay + ":" + this.nay + ":" + this.connectedPlayers.length);
    }
    endVote() {
        this.voteEnded = true;
        let data = [[], [], []];
        data[0].push(this.currentPresident.name);
        data[0].push(this.nominatedChancellor.name);
        data[1] = this.nayers;
        data[2] = this.yayers
        console.log("num of yayers: " + this.yayers.length);

        if (this.yay > this.nay) {
            this.currentChancellor = this.nominatedChancellor;
            this.excludedPresident = this.currentPresident;
            console.log("excluding president " + this.excludedPresident.name);

            if (this.currentChancellor.id == this.hitler.id && this.fascistPolicies >= 3) {
                this.endGame(1)
                return;
            } else {
                console.log("end of game not triggered: Chancellor id = " + this.currentChancellor.id + ", hitler.id = " + this.hitler.id);
            }
            io.to(this.roomname).emit('waiting event', { title: 'President ' + this.currentPresident.name + ' and Chancellor ' + this.currentChancellor.name + ' were elected', excluded: 'none' });
            // setTimeout(this.runPolicyTurn, 5000);

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

function init() {
    initDeck();
    this.liberalPolicies = 0;
    this.fascistPolicies = 0;
    this.gameOver = false;
    gameStarted = true;
    io.sockets.emit('gameStart');
    console.log("Game begin")
    this.selectPair.pickPresident();
}

function skipPair() {
    this.selectPair = new this.selectPair();
    this.selectPair.pickPresident();

}

function runPolicyTurn() {
    this.policyTurnManager = new this.policyTurnManager();
    this.policyTurnManager.beginNewTurn();
    console.log("Policy Turn");
}

function initDeck() {
    this.policies = [];
    for (let i = 0; i < 11; i++) {
        this.policies.push(FASCIST);
    }

    for (let i = 0; i < 6; i++) {
        this.policies.push(LIBERAL);
    }
    this.policies = shuffleArray(policies);
    console.log(policies);
    for (let i = 0; i < this.policies.length; i++) {
        console.log(policies[i]);
    }

    this.drawPolicies = this.policies;
}


function runSpecialAbilityCheck() {
    console.log("testing");
    if (this.expectedLength == 5 || this.expectedLength == 6) {
        switch (this.fascistPolicies) {
            case 3:
                setTimeout(this.presidentialPowerManager.examineTopThreeCards, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    } else if (this.expectedLength == 7 || this.expectedLength == 8) {
        switch (this.fascistPolicies) {
            case 2:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 3:
                setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    } else if (this.expectedLength == 9 || this.expectedLength == 10) {
        switch (this.fascistPolicies) {
            case 1:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 2:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 3:
                setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    }

}

function checkElectionTracker() {
    if (electionTracker >= 3) {
        this.policyTurnManager.placePolicyAutoElectionTracker();
        electionTracker = 0;
        io.sockets.emit('ElectionTrackerReachMax');
        return true;
    }
    return false;
}

function endGame(winner) {
    this.gameOver = true;
    io.sockets.emit('this.gameOver', [winner, hitler, this.fascists]);
    this.connectedPlayers = [];
    this.deadPlayers = [];
    hitler = null;
    this.liberals = [];
    this.fascists = [];
    this.possibleRoles = shuffleArray(roles);
    this.policies = [];
    this.discardPolicies = [];
    this.drawPolicies = [];
    gameStarted = false;

    this.liberalPolicies = 0;
    this.fascistPolicies = 0;

    this.currentPresientIndex = 0;
    this.currentPresident = null;
    currentChancellor = null;

    this.lobbyCreated = false;

    this.expectedLength = 5;


    this.excludedPresident = null;
    this.excludedInvestigatedPlayer = null;

    electionTracker = 0;

    this.selectPair = new this.selectPair();
    this.policyTurnManager = new this.policyTurnManager();
    this.presidentialPowerManager = new this.presidentialPowerManager();
    initDeck();
}

