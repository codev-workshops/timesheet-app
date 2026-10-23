const fs = require('fs');
const path = require('path');
const { buildFeatures, toVector } = require('./features');
const { predictRidge } = require('./ridge');

const DEFAULT_MODEL_PATH = path.join(__dirname, 'model.json');
const MIN_HOURS = 0.25;
const MAX_HOURS = 24;

let cachedModel = null;

function loadModel(modelPath = DEFAULT_MODEL_PATH) {
  cachedModel = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  return cachedModel;
}

function predictHours(input, model = cachedModel || loadModel()) {
  const x = toVector(buildFeatures(input), model.meta);
  const raw = predictRidge(model, x);
  const clipped = Math.min(MAX_HOURS, Math.max(MIN_HOURS, raw));
  return Math.round(clipped * 100) / 100;
}

module.exports = { predictHours, loadModel };
