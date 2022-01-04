const mongoose = require('mongoose')

const gameSchema = new mongoose.Schema({
    headerimage: String,
    appid: Number,
    multiplayer: Boolean,
    name: String,

})

module.exports = mongoose.model('Game', gameSchema);