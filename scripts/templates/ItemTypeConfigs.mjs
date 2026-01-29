/**
 * Configuration generators for different item types
 */
import { generateSpellDamageConfigHTML } from './SpellDamageConfig.mjs';
import { generateSummoningConfigHTML } from './SummoningConfig.mjs';
import { generateItemGiveConfigHTML } from './ItemGiveConfig.mjs';
import { generateItemMacroConfigHTML } from './ItemMacroConfig.mjs';
import { generateTemplateTargetingConfigHTML } from './TemplateTargetingConfig.mjs';

/**
 * Generate Spell damage config (with target variables)
 */
export function generateSpellConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray, criticalEffectsListHtml = '', criticalEffectsArray = []) {
	const targetingConfig = generateTemplateTargetingConfigHTML(MODULE_ID, flags);

	const damageConfig = generateSpellDamageConfigHTML(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, {
		targetLabel: 'TARGET',
		showTargetOption: true,
		requirementExamples: '@target.level < 3, @target.hp > 10, @level >= 5',
		effectsRequirementExamples: '@target.level < 5, @target.hp < 20, @level >= 3'
	}, criticalEffectsListHtml, criticalEffectsArray);

	const summoningFlags = flags.summoning || { enabled: false };
	const summoningConfig = generateSummoningConfigHTML(MODULE_ID, summoningFlags, summonsList, summonProfilesArray);

	const itemGiveFlags = flags.itemGive || { enabled: false };
	const itemGiveConfig = generateItemGiveConfigHTML(MODULE_ID, itemGiveFlags, itemGiveList, itemGiveProfilesArray);

	const itemMacroConfig = generateItemMacroConfigHTML(MODULE_ID, flags, 'spell');

	return targetingConfig + damageConfig + summoningConfig + itemGiveConfig + itemMacroConfig;
}

/**
 * Generate Potion damage config (applies to drinker, uses caster variables)
 */
export function generatePotionConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray) {
	const damageConfig = generateSpellDamageConfigHTML(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, {
		targetLabel: 'Drinker',
		formulaHelp: 'Available variables (for drinker):&#10;@level, @str, @dex, @con, @int, @wis, @cha, @strBase, @dexBase, @conBase, @intBase, @wisBase, @chaBase, @hp, @ac&#10;&#10;Examples:&#10;2d6 + @con&#10;(@level)d6&#10;3d6 + @int',
		requirementExamples: '@hp < 10',
		effectsRequirementExamples: '@level < 5, @hp < 20',
		showTargetOption: false,
		tieredFormulaHelp: 'Level-based tiered formula. Rolls different dice based on drinker\'s level.&#10;&#10;Format: level-range:formula, level-range:formula, ...&#10;&#10;Examples:&#10;1-3:1d6, 4-6:2d8, 7-9:3d10, 10+:4d12&#10;1-4:1d4, 5-9:2d6, 10+:3d8+2',
		noteText: 'Potions apply to the drinker, so use caster variables like @level, @hp, etc.'
	});

	const summoningFlags = flags.summoning || { enabled: false };
	const summoningConfig = generateSummoningConfigHTML(MODULE_ID, summoningFlags, summonsList, summonProfilesArray);

	const itemGiveFlags = flags.itemGive || { enabled: false };
	const itemGiveConfig = generateItemGiveConfigHTML(MODULE_ID, itemGiveFlags, itemGiveList, itemGiveProfilesArray);

	const itemMacroConfig = generateItemMacroConfigHTML(MODULE_ID, flags, 'potion');

	return damageConfig + summoningConfig + itemGiveConfig + itemMacroConfig;
}

/**
 * Generate Scroll damage config (with target variables)
 */
export function generateScrollConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray) {
	const targetingConfig = generateTemplateTargetingConfigHTML(MODULE_ID, flags);

	const damageConfig = generateSpellDamageConfigHTML(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, {
		targetLabel: 'TARGET',
		showTargetOption: true,
		requirementExamples: '@target.level < 3, @target.hp > 10, @level >= 5',
		effectsRequirementExamples: '@target.level < 5, @target.hp < 20, @level >= 3'
	});

	const summoningFlags = flags.summoning || { enabled: false };
	const summoningConfig = generateSummoningConfigHTML(MODULE_ID, summoningFlags, summonsList, summonProfilesArray);

	const itemGiveFlags = flags.itemGive || { enabled: false };
	const itemGiveConfig = generateItemGiveConfigHTML(MODULE_ID, itemGiveFlags, itemGiveList, itemGiveProfilesArray);

	const itemMacroConfig = generateItemMacroConfigHTML(MODULE_ID, flags, 'spell');

	return targetingConfig + damageConfig + summoningConfig + itemGiveConfig + itemMacroConfig;
}

/**
 * Generate Wand damage config (with target variables)
 */
export function generateWandConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray) {
	const targetingConfig = generateTemplateTargetingConfigHTML(MODULE_ID, flags);

	const damageConfig = generateSpellDamageConfigHTML(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, {
		targetLabel: 'TARGET',
		showTargetOption: true,
		requirementExamples: '@target.level < 3, @target.hp > 10, @level >= 5',
		effectsRequirementExamples: '@target.level < 5, @target.hp < 20, @level >= 3'
	});

	const summoningFlags = flags.summoning || { enabled: false };
	const summoningConfig = generateSummoningConfigHTML(MODULE_ID, summoningFlags, summonsList, summonProfilesArray);

	const itemGiveFlags = flags.itemGive || { enabled: false };
	const itemGiveConfig = generateItemGiveConfigHTML(MODULE_ID, itemGiveFlags, itemGiveList, itemGiveProfilesArray);

	const itemMacroConfig = generateItemMacroConfigHTML(MODULE_ID, flags, 'spell');

	return targetingConfig + damageConfig + summoningConfig + itemGiveConfig + itemMacroConfig;
}

