(function($) {
	class Counter {
		constructor(initialCount = 0, counterClass = '') {
			this.initialCount = initialCount;
			this.value = initialCount;
			this.$element = $('<div>', { class: 'counter ' + counterClass });
			this.$element.data('counter', this);
			this.$element.append($('<button>', { class: 'counter-minus-button', text: '-' }));
			this.$element.append($('<button>', { class: 'counter-plus-button', text: '+' }));
			this.$value = $('<p>', { text: initialCount });
			this.$element.append($('<div>', { class: 'counter-count' }).append(this.$value));
		}

		set(value) {
			this.value = value;
			this.$value.text(value >= 0 ? value : '');
		}

		adjust(delta) {
			this.set(delta < 0 ? Math.max(0, this.value + delta) : this.value + delta);
		}

		reset() {
			this.set(this.initialCount);
		}
	}

	class CounterRepeat {
		constructor() {
			this.timer = null;
			this.activePointer = null;
			this.repeatedButton = null;
		}

		start(event, button) {
			const pointer = event.originalEvent;
			if (this.activePointer !== null || !pointer.isPrimary || pointer.button !== 0) {
				return;
			}
			this.repeatedButton = null;
			this.activePointer = pointer.pointerId;
			const repeat = () => {
				if (!button.isConnected) {
					this.stop();
					return;
				}
				this.repeatedButton = button;
				this.adjust(button);
				this.timer = setTimeout(repeat, 50);
			};
			this.timer = setTimeout(repeat, 400);
		}

		stop() {
			clearTimeout(this.timer);
			this.timer = null;
			this.activePointer = null;
		}

		end(event) {
			if (event.originalEvent.pointerId === this.activePointer) {
				this.stop();
				if (event.type === 'pointercancel') {
					this.repeatedButton = null;
				}
			}
		}

		cancel() {
			this.stop();
			this.repeatedButton = null;
		}

		click(event, button) {
			if (this.repeatedButton === button && event.originalEvent?.detail !== 0) {
				this.repeatedButton = null;
				return;
			}
			this.repeatedButton = null;
			this.adjust(button);
		}

		adjust(button) {
			const $button = $(button);
			const delta = $button.hasClass('counter-minus-button') ? -1 : 1;
			$button.parent().data('counter').adjust(delta);
		}
	}

	const sortablePlayZones = new Map([
		['hand', 'handIds'],
		['graveyard', 'graveyardIds'],
	]);

	const cardTypeRules = [
		['Token', 'Token'],
		['Land', 'Enchantment Land'],
		['Enchantment', 'Enchantment', 'Saga'],
		['EnchantmentCreature', 'Enchantment', 'Creature'],
		['Enchantment', 'Enchantment', 'Class'],
		['Aura', 'Enchantment', 'Aura'],
		['Enchantment', 'Enchantment'],
		['Land', 'Artifact Land'],
		['ArtifactCreature', 'Artifact', 'Creature'],
		['Equipment', 'Artifact', 'Equipment'],
		['Artifact', 'Artifact'],
		['Planeswalker', 'Planeswalker'],
		['Battle', 'Battle'],
		['Creature', 'Creature'],
		['Sorcery', 'Sorcery'],
		['Instant', 'Instant'],
		['BasicLand', 'Basic Land'],
		['Land', 'Land'],
	];

	const MTG = {
		columnCount: 18,
		rowCount: 5,
		libraryListColumnCount: 4,
		cardWidth: 75,
		cardHeight: 105,

		cardIds: {},
		commandZoneIds: [],
		deckIds: [],
		tokenIds: [],

		meta: {
			strategy: [],
			ramp: [],
			advantage: [],
			interaction: [],
			land: []
		},

		basicLands: [
			{ id: 'b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6', name: 'forest', count: 0 },
			{ id: 'b2c6aa39-2d2a-459c-a555-fb48ba993373', name: 'island', count: 0 },
			{ id: 'a3fb7228-e76b-4e96-a40e-20b5fed75685', name: 'mountain', count: 0 },
			{ id: 'bc71ebf6-2056-41f7-be35-b2e5c34afa99', name: 'plains', count: 0 },
			{ id: '56719f6a-1a6c-4c0a-8d21-18f7d7350b68', name: 'swamp', count: 0 },
			{ id: '05d24b0c-904a-46b6-b42a-96a4d91a0dd4', name: 'wastes', count: 0 },
		],

		oracleCardsById: new Map(),
		cardData: [],
		compareIds: [],
		charts: [],

		libraryIds: [],
		handIds: [],
		graveyardIds: [],

		turn: 1,
		mode: null,
		saveFile: null
	};

	MTG.init = function() {
		this.oracleCardsById.clear();
		for (const card of masterData) {
			const id = card.oracle_id;
			if (!this.oracleCardsById.has(id)) {
				this.oracleCardsById.set(id, []);
			}
			this.oracleCardsById.get(id).push(card);
		}

		this.rebuildCardData();
	};

	MTG.setPlayZoneWidths = function() {
		$('#hand, #battlefield').css({
			width: this.columnCount * this.cardWidth
		});
		$('#library-cards').css({
			width: (this.columnCount - this.libraryListColumnCount) * this.cardWidth
		});
		$('#library-list').css({
			width: this.libraryListColumnCount * this.cardWidth
		});
		$('#graveyard').css({
			width: (this.columnCount - this.tokenIds.length - this.commandZoneIds.length - 1) * this.cardWidth
		});
		$('#token-box').css({
			width: this.tokenIds.length * this.cardWidth
		});
		$('#command-zone').css({
			width: this.commandZoneIds.length * this.cardWidth
		});
		$('#library').css({
			width: this.cardWidth
		});
	};

	MTG.bindDialogOverlay = function(dialogSelector) {
		$('.ui-widget-overlay').on('click', function() {
			$(dialogSelector).dialog('close');
		});
	};

	MTG.setupDialogs = function() {
		const deckDialogDefaults = {
			autoOpen: false,
			modal: true,
			width: 420,
			height: 420,
			position: {
				my: 'center',
				at: 'center',
				of: 'body'
			}
		};

		$('#import-dialog').dialog({
			...deckDialogDefaults,
			title: 'Import',
			open: function() {
				MTG.bindDialogOverlay('#import-dialog');
			}
		});

		$('#save-dialog').dialog({
			...deckDialogDefaults,
			title: 'Save',
			open: function() {
				for (const { name, count } of MTG.basicLands) {
					$(`#set-${name}`).val(count);
				}

				$('#set-command-zone').select2({
					data: MTG.getCommandZoneOptions(),
				});

				$('#set-command-zone').val(MTG.commandZoneIds).trigger('change');

				$('#file-create').attr('disabled', MTG.commandZoneIds.length === 0);

				MTG.bindDialogOverlay('#save-dialog');
			}
		});

		$('#view-json-dialog').dialog({
			title: 'View JSON',
			autoOpen: false,
			modal: true,
			width: 420,
			buttons: {
				'Select all': function() {
					const output = document.getElementById('view-json-text');
					output.focus();
					output.select();
				},
				Close: function() {
					$(this).dialog('close');
				}
			}
		});

		$('#library-dialog').dialog({
			title: 'Library',
			autoOpen: false,
			modal: true,
			width: 'auto',
			height: 'auto',
			position: {
				my: 'left',
				at: 'left',
				of: 'body'
			},
		});
	};

	MTG.setupOracleSearch = function() {
		$('#oracle-search').autocomplete({
			minLength: 3,
			source: function(request, response) {
				const matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), 'i');
				const matches = [];
				for (const card of masterData) {
					if (matcher.test(card.name)) {
						matches.push({ label: card.name, value: card.oracle_id });
					}
				}
				response(matches);
			},
			position: {
				my: 'right top',
				at: 'left top',
			},
			focus: function(event, ui) {
				let card = MTG.findOracleCard(ui.item.value);

				MTG.showCardPreview(card, MTG.getDefaultCardSide(card));
			},
			select: function(event, ui) {
				let card = MTG.findOracleCard(ui.item.value);

				if (!MTG.cardIds.hasOwnProperty(card.oracle_id)) {
					MTG.cardIds[card.oracle_id] = card.name;
					MTG.cardData.push(card);
					MTG.clear();
					MTG.createCardTree();
					MTG.setCardCounts();

					$('#oracle-search').val('');
				}

				return false;
			},
			close: function(event, ui) {
				MTG.resetPreview();
			}
		});
	};

	MTG.switchView = function(mode, render) {
		this.mode = mode;
		$('#view-json').prop('disabled', mode !== 'deck' && mode !== 'meta');
		this.clear();
		render.call(this);
		$('#game-menu button').prop('disabled', mode !== 'play');
	};

	MTG.setupUI = function() {
		this.bindDeckBuilderControls();
		this.bindPlayControls();
		this.bindCardInteractions();
	};

	MTG.bindDeckBuilderControls = function() {
		$('#set-command-zone').on('select2:select select2:unselect', function(e) {
			const id = e.params.data.id;
			const index = MTG.commandZoneIds.indexOf(id);
			if (e.type === 'select2:unselect' && index !== -1) {
				MTG.commandZoneIds.splice(index, 1);
			} else if (e.type === 'select2:select' && index === -1) {
				MTG.commandZoneIds.push(id);
			}

			MTG.setDeckCount();
			$('#file-create').attr('disabled', MTG.commandZoneIds.length === 0);
		});

		$('#hud').on('click', function() {
			$('#data-menu, #compare-menu, #build-menu, #preview').toggle();
		});

		$('#data-file').on('change', function() {
			let file = $(this).prop('files')[0];

			MTG.readFileAsText(file, function(text) {
				MTG.loadDataFile(text);
				MTG.clear();
				MTG.rebuildCardData();
			});
		});

		$('#save').on('click', function() {
			$('#save-dialog').dialog('open');
		});

		$('#file-create').on('click', function() {
			MTG.saveDataFile();
		});

		$('#file-link').on('click', function() {
			$(this).hide()
		});

		$('#compare-file').on('change', function() {
			let file = $(this).prop('files')[0];

			MTG.readFileAsText(file, function(text) {
				MTG.loadCompareFile(text);
			});
		});

		$('#compare').on('click', function() {
			MTG.switchView('compare', MTG.createCardCompare);
		});

		$('#oracle').on('click', function() {
			MTG.switchView('oracle', MTG.createCardTree);
			MTG.setCardCounts();
		});

		$('#deck').on('click', function() {
			MTG.switchView('deck', MTG.createCardTree);
		});

		$('#meta').on('click', function() {
			MTG.switchView('meta', MTG.createCardMeta);
		});

		$('#stats').on('click', function() {
			MTG.switchView('stats', MTG.createCardStats);
		});

		$('#view-json').on('click', function() {
			if (this.disabled) {
				return;
			}

			const data = MTG.mode === 'deck'
				? MTG.getDeckJsonData(MTG.getDeckData())
				: MTG.getMetaJsonData();
			$('#view-json-text').val(JSON.stringify(data, null, 2));
			$('#view-json-dialog').dialog('open');
		});

		$('#import').on('click', function() {
			$('#import-dialog').dialog('open');
		});

		$('#import-data').on('click', function() {
			MTG.importCardNames($('#import-text').val());
			$('#import-text').val('');
			$("#import-dialog").dialog('close');
			MTG.rebuildCardData();
		});
	};

	MTG.bindPlayControls = function() {
		$('#play').on('click', function() {
			MTG.switchView('play', MTG.createCardPlay);
			MTG.setPlayZoneWidths();

			MTG.resetPlaySession();
		});

		$('#reset').on('click', function() {
			MTG.resetPlaySession();
		});

		$('#shuffle').on('click', function() {
			MTG.shuffle();
			MTG.refreshLibrary();
		});

		$('#draw-1').on('click', function() {
			MTG.drawAndRefresh(1);
		});

		$('#draw-7').on('click', function() {
			MTG.drawAndRefresh(7);
		});

		$('#discard').on('click', function() {
			MTG.discard();
			MTG.refreshGraveyard();
			MTG.refreshHand();
		});

		$('#gy-to-lib').on('click', function() {
			MTG.graveyardToLibrary();
			MTG.refreshGraveyard();
			MTG.refreshLibrary();
		});

		$('#turn').on('click', function() {
			MTG.turn++;
			MTG.updateTurnLabel();
			$('.tapped').removeClass('tapped');
			$('.mana-counter').find('.counter').each(function() {
				$(this).data('counter').set(0);
			});
		});

		$('#toggle').on('click', function() {
			$('#library-dialog').dialog('open');
		});
	};

	MTG.bindCardInteractions = function() {
		$(document).on('click', '.card:not(.battlefield-card)', function() {
			const $card = $(this);
			const card = $card.data('card');
			const nextSide = $card.data('side') === 'front' ? 'back' : 'front';

			$card.data('side', nextSide).css({
				backgroundImage: 'url(' + MTG.getSmallImage(card, nextSide) + ')'
			});
			MTG.showCardPreview(card, nextSide);
		});

		$(document).on('dblclick', '.card', function() {
			const card = $(this).data('card');
			const cardType = MTG.getCardType(card);

			switch (MTG.mode) {
				case 'oracle':
					MTG.moveToDeck(card.oracle_id, cardType);
					MTG.clear();
					MTG.createCardTree();
					MTG.setCardCounts();

					break;
				case 'deck':
					MTG.removeFromDeck(card.oracle_id, cardType);
					MTG.removeMetaType(card.oracle_id);
					MTG.clear();
					MTG.createCardTree();

					break;
				case 'meta':
					if ($(this).hasClass('deck-card')) {
						MTG.removeFromDeck(card.oracle_id, cardType);
					}
					MTG.removeMetaType(card.oracle_id);
					MTG.clear();
					MTG.createCardMeta();

					break;
				case 'play':
					if ($(this).hasClass('library-card')) {
						MTG.putIntoHand(card.oracle_id);
						MTG.shuffle();
						MTG.refreshLibrary();
						MTG.refreshHand();
						$('#library-dialog').dialog('close');
					}

					break;
			}
		});

		$(document).on('mouseenter', '.card', function() {
			let card = $(this).data('card');
			let side = $(this).data('side');

			MTG.showCardPreview(card, side);

			$(this).children('.counter-toggle').show();
			$(this).children('.tap-toggle').show();
		});

		$(document).on('mouseleave', '.card', function() {
			MTG.resetPreview();
			$('.counter-toggle').hide();
			$('.tap-toggle').hide();
		});

		$(document).on('mousedown mouseup', '.list-card', function(event) {
			const $libraryCards = $('#library-cards div[oracle_id="' + $(this).attr('oracle_id') + '"]');

			$libraryCards.toggleClass('highlight', event.type === 'mousedown');
		});

		$(document).on('click', '.counter-toggle', function(event) {
			event.stopPropagation();

			$(this).parent().children('.counter').each(function() {
				$(this).toggle();
			});
		});

		const counterRepeat = new CounterRepeat();
		const counterButtons = '.counter-minus-button, .counter-plus-button';

		$(document).on('mousedown', counterButtons, function(event) {
			event.stopPropagation();
		});

		$(document).on('pointerdown', counterButtons, function(event) {
			counterRepeat.start(event, this);
		});

		$(document).on('pointerup pointercancel', function(event) {
			counterRepeat.end(event);
		});

		$(window).on('blur', function() {
			counterRepeat.cancel();
		});

		$(document).on('click', counterButtons, function(event) {
			event.stopPropagation();
			counterRepeat.click(event, this);
		});

		$(document).on('click', '.counter-count', function(event) {
			event.stopPropagation();

			$(this).parent().data('counter').set(0);
		});

		$(document).on('click', '.tap-toggle', function(event) {
			event.stopPropagation();

			$(this).parent().toggleClass('tapped');
		});
	};



	MTG.importCardNames = function(text) {
		for (const line of text.split('\n')) {
			const cardName = line.trim();
			const nameKey = cardName.toLowerCase();
			const card = masterData.find(item => item.name.toLowerCase() === nameKey);

			if (card) {
				console.log({ value: card.oracle_id, label: card.name });
				this.cardIds[card.oracle_id] = card.name;
			} else {
				console.log(cardName);
			}
		}
	};

	MTG.readFileAsText = function(file, onLoad) {
		const fileReader = new FileReader();
		fileReader.onload = function() {
			onLoad(fileReader.result);
		};
		fileReader.readAsText(file);
	};

	MTG.loadDataFile = function(json) {
		let data = JSON.parse(json);

		this.cardIds = data.cardIds;
		this.deckIds = data.deckIds;
		this.tokenIds = data.tokenIds;
		this.commandZoneIds = data.commandZoneIds;
		for (const land of this.basicLands) {
			land.count = data[`${land.name}Count`];
		}

		this.meta = data.meta;

		this.cardData = [];

		this.setDeckCount();
	};

	MTG.getSaveData = function() {
		const build = {
			cardIds: {},
			deckIds: this.deckIds,
			tokenIds: this.tokenIds,
			commandZoneIds: this.commandZoneIds,
		};
		for (const land of this.basicLands) {
			build[`${land.name}Count`] = land.count;
		}
		build.meta = this.meta;

		for (const card of this.cardData) {
			build.cardIds[card.oracle_id] = card.name;
		}
		return build;
	};

	MTG.saveDataFile = function() {
		for (const land of this.basicLands) {
			land.count = parseInt($(`#set-${land.name}`).val());
		}
		this.setDeckCount();

		const commandZoneCard = this.getCard(this.commandZoneIds[0]);
		const build = this.getSaveData();

		let blob = new Blob(
			[
				JSON.stringify(build, null, 2)
			],
			{
				type: 'application/json'
			}
		);

		if (this.saveFile !== null) {
			window.URL.revokeObjectURL(this.saveFile);
		}
		this.saveFile = window.URL.createObjectURL(blob);

		let $fileLink = $('#file-link');
		$fileLink.text(commandZoneCard.name + '.json');
		$fileLink.attr({
			download: commandZoneCard.name + '.json',
			href : this.saveFile
		});
		$fileLink.show();
	};

	MTG.loadCompareFile = function(json) {
		this.compareIds = JSON.parse(json).deckIds;
	};



	MTG.findOracleCard = function(id) {
		const matches = this.oracleCardsById.get(id);
		return matches ? matches[0] : undefined;
	};

	MTG.rebuildCardData = function() {
		$('#data-menu button, #compare-menu button, #build-menu button:not(#view-json), #game-menu button').attr('disabled', true);

		this.cardData = this.collectCardData();

		$('#data-menu button, #compare-menu button, #build-menu button:not(#view-json)').attr('disabled', false);
	};

	MTG.collectCardData = function() {
		const landIds = this.basicLands.map(({ id }) => id);
		const cardIds = Object.keys(this.cardIds).filter(id => !landIds.includes(id));
		const ids = landIds.concat(cardIds);
		const cards = [];
		for (const id of ids) {
			const matches = this.oracleCardsById.get(id);
			if (matches) {
				for (const card of matches) {
					cards.push(card);
				}
			}
		}
		return cards;
	};



	MTG.clear = function() {
		for (const chart of this.charts) {
			chart.destroy();
		}
		this.charts.length = 0;
		$('#content, #library-dialog').empty();
	};

	MTG.createCardTree = function() {
		let cardData = [];
		switch (this.mode) {
			case 'oracle':
				cardData = this.getOracleData();

				break;
			case 'deck':
				cardData = this.getDeckData().concat(this.getTokenData());

				break;
		}

		this.renderCardTree(this.getCardTreeData(cardData));
	};

	MTG.renderCardTree = function(cardTreeData) {
		let cardTypes = [
			'Aura',
			'Enchantment',
			'EnchantmentCreature',
			'Equipment',
			'Artifact',
			'ArtifactCreature',
			'Creature',
			'Planeswalker',
			'Battle',
			'Instant',
			'Sorcery',
			'Land',
			'BasicLand',
			'Token',
		];

		for (let i = 0; i < cardTypes.length; i++) {
			let cardType = cardTypes[i];

			if (cardTreeData.hasOwnProperty(cardType)) {
				let cardTypeData = cardTreeData[cardType];

				let $cardType = $('<div>', {
					class: 'card-section'
				});

				for (let cardCmc in cardTypeData) {
					let cardCmcData = cardTypeData[cardCmc];
					let $cardCmc = $('<div>', {
						class: 'card-group'
					});

					for (let i = 0; i < cardCmcData.length; i++) {
						let card = cardCmcData[i];
						let $card = this.createCard(card, 'card-' + card.oracle_id);

						$cardCmc.append($card);
					}

					$cardType.append($cardCmc);
				}

				$('#content').append($cardType);
			}
		}
	};

	MTG.createCardCompare = function() {
		this.appendComparisonSection(this.getExclusiveCardIds(this.deckIds, this.compareIds));
		this.appendComparisonSection(this.getExclusiveCardIds(this.compareIds, this.deckIds));
	};

	MTG.getExclusiveCardIds = function(cardIds, otherIds) {
		return cardIds.filter(cardId => !otherIds.includes(cardId));
	};

	MTG.appendComparisonSection = function(cardIds) {
		const $section = $('<div>', { class: 'card-section' });
		const $group = $('<div>', { class: 'card-group' });

		for (const cardId of cardIds) {
			const card = this.getCard(cardId);
			$group.append(this.createCard(card, 'card-' + card.oracle_id));
		}

		$section.append($group);
		$('#content').append($section);
	};

	MTG.getDeckJsonData = function(deckData) {
		const landNames = [];
		const nonLandNames = [];
		const allNames = [];
		for (const card of deckData) {
			allNames.push(card.name);
			const type = this.getCardTreeType(card);
			(type === 'Land' || type === 'BasicLand' ? landNames : nonLandNames).push(card.name);
		}

		const byName = (a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'});
		return [landNames.sort(byName), nonLandNames.sort(byName), allNames.sort(byName)];
	};

	MTG.createCardMeta = function() {
		this.createDeckMeta();
		this.createMeta();

		this.refreshDeckMeta();
		this.refreshMeta();
	};

	MTG.getMetaJsonData = function() {
		const meta = {
			strategy: [],
			ramp: [],
			advantage: [],
			interaction: []
		};

		for (let metaType in meta) {
			for (let cardId of this.meta[metaType]) {
				meta[metaType].push(this.getCardName(cardId));
			}
		}
		return meta;
	};

	MTG.createCardPlay = function() {
		this.createLibraryBrowser();
		this.createSortablePlayZone('hand', '.graveyard-card, .battlefield-card');
		this.createSortablePlayZone('graveyard', '.hand-card, .battlefield-card');
		$('#content').append($('<div>', { id: 'token-box' }));
		$('#content').append($('<div>', { id: 'command-zone' }));
		this.createLibrary();
		this.createBattlefield();
	};

	MTG.createCardStats = function() {
		let $charts = $('<div>', {
			class: 'charts',
		});
		$('#content').append($charts);

		const { manaCosts, averageManaCost, cardTypes, devotions, rarities, metaTypes } =
			this.getDeckStats(this.getDeckData());
		this.createManaCostChart($charts, manaCosts, averageManaCost);
		this.createCardTypeChart($charts, cardTypes);
		this.createDevotionChart($charts, devotions);
		this.createRarityChart($charts, rarities);
		this.createMetaTypeChart($charts, metaTypes);
	};

	MTG.getDeckStats = function(deckData) {
		let manaCount = 0;
		let spellCount = 0;
		let highestManaValue = -1;
		const manaCosts = {};

		let cardTypes = {
			'Aura': 0,
			'Enchantment': 0,
			'EnchantmentCreature': 0,
			'Equipment': 0,
			'Artifact': 0,
			'ArtifactCreature': 0,
			'Creature': 0,
			'Planeswalker': 0,
			'Battle': 0,
			'Instant': 0,
			'Sorcery': 0,
			'Land': 0,
			'BasicLand': 0,
			'Legendary': 0,
		};

		let devotions = {
			'Black': 0,
			'Blue': 0,
			'Green': 0,
			'Grey': 0,
			'Red': 0,
			'White': 0,
		};

		let rarities = {
			'common': 0,
			'uncommon': 0,
			'rare': 0,
			'mythic': 0,
		};

		let metaTypes = {
			'strategy': 0,
			'advantage': 0,
			'interaction': 0,
			'ramp': 0,
			'land': 0,
			'none': 0
		};

		for (let i = 0; i < deckData.length; i++) {
			let card = deckData[i];
			if (card.hasOwnProperty('type_line')) {
				const cardType = this.getCardType(card);
				rarities[card.rarity]++;
				metaTypes[this.getMetaType(card, cardType)]++;

				if (cardType !== 'Land' && cardType !== 'BasicLand' && cardType !== 'Token') {
					manaCosts[card.cmc] = (manaCosts[card.cmc] ?? 0) + 1;
					highestManaValue = Math.max(highestManaValue, card.cmc);

					manaCount += card.cmc;
					spellCount++;
				}

				if (this.isLegendary(card)) {
					cardTypes['Legendary']++;
				}

				if (cardType !== null) {
					cardTypes[cardType]++;
				}
			}

			if (card.hasOwnProperty('mana_cost')) {
				devotions.Black += (card.mana_cost.match(/B/g) || []).length;
				devotions.Blue += (card.mana_cost.match(/U/g) || []).length;
				devotions.Green += (card.mana_cost.match(/G/g) || []).length;
				devotions.Grey += (card.mana_cost.match(/C/g) || []).length;
				devotions.Grey += parseInt(card.mana_cost.replace(/\D/g, "")) || 0;
				devotions.Red += (card.mana_cost.match(/R/g) || []).length;
				devotions.White += (card.mana_cost.match(/W/g) || []).length;
			}
		}

		for (let manaValue = 0; manaValue <= highestManaValue; manaValue++) {
			manaCosts[manaValue] ??= 0;
		}

		const averageManaCost = spellCount === 0 ? null : manaCount / spellCount;
		return { manaCosts, averageManaCost, cardTypes, devotions, rarities, metaTypes };
	};

	MTG.createManaCostChart = function($charts, manaCosts, averageManaCost) {
		const average = averageManaCost?.toFixed(2) ?? 'N/A';
		$charts.append($('<h2>', {
			text: `Mana Curve \u00b7 Average mana value: ${average}`
		}));
		this.createBarChart($charts, 'mana-cost-chart', manaCosts, 'Number of spells', false);
	};

	MTG.createCardTypeChart = function($charts, cardTypes) {
		this.createBarChart($charts, 'card-type-chart', cardTypes, 'Number of cards');
	};

	MTG.createBarChart = function($charts, canvasId, counts, label, showLegend = true) {
		const canvas = this.createChartCanvas($charts, canvasId, 'bar-chart', 1200);
		const chart = new Chart(canvas, {
			type: 'bar',
			options: {
				legend: { display: showLegend }
			},
			data: {
				labels: Object.keys(counts),
				datasets: [
					{
						label: label,
						data: Object.values(counts),
						backgroundColor: 'gray',
						borderColor: 'black',
					}
				]
			},
		});
		this.charts.push(chart);
	};

	MTG.createDevotionChart = function($charts, devotions) {
		let devotionLabels = [];
		let devotionData = [];
		let devotionColors = [];
		for (let color in devotions) {
			let colorCount = devotions[color];

			if (colorCount > 0) {
				devotionLabels.push(color);
				devotionData.push(colorCount);
				devotionColors.push(color.toLowerCase());
			}
		}

		this.createPieChart($charts, 'devotion-chart', 'Devotion', devotionLabels, devotionData, devotionColors);
	};

	MTG.createRarityChart = function($charts, rarities) {
		this.createCategorizedPieChart($charts, 'rarity-chart', 'Rarity', rarities, [
			['common', 'Common', '#000000'],
			['uncommon', 'Uncommon', '#808080'],
			['rare', 'Rare', '#FFD700'],
			['mythic', 'Mythic', '#FF7A0E'],
		]);
	};

	MTG.createMetaTypeChart = function($charts, metaTypes) {
		this.createCategorizedPieChart($charts, 'meta-type-chart', 'Meta category', metaTypes, [
			['strategy', 'Strat', '#FF0000'],
			['advantage', 'Adv', '#0000FF'],
			['interaction', 'Int', '#FFFFFF'],
			['ramp', 'Ramp', '#008000'],
			['land', 'Land', '#005000'],
			['none', 'none', '#002000'],
		]);
	};

	MTG.createCategorizedPieChart = function($charts, canvasId, label, counts, slices) {
		const labels = [];
		const values = [];
		const colors = [];
		for (const [key, sliceLabel, color] of slices) {
			labels.push(sliceLabel);
			values.push(counts[key]);
			colors.push(color);
		}
		this.createPieChart($charts, canvasId, label, labels, values, colors);
	};

	MTG.createPieChart = function($charts, canvasId, label, labels, values, colors) {
		const canvas = this.createChartCanvas($charts, canvasId, 'pie-chart', 300);
		const chart = new Chart(canvas, {
			type: 'pie',
			borderColor: 'black',
			data: {
				labels: labels,
				datasets: [
					{
						label: label,
						data: values,
						backgroundColor: colors,
						borderColor: 'black',
					}
				]
			},
		});
		this.charts.push(chart);
	};

	MTG.createChartCanvas = function($charts, canvasId, chartClass, width) {
		const $chart = $('<div>', { class: 'chart ' + chartClass });
		$chart.append($('<canvas>', { id: canvasId, width: width, height: 300 }));
		$charts.append($chart);
		return document.getElementById(canvasId);
	};




	MTG.createDeckMeta = function() {
		let $deckSection = $('<div>', {
			class: 'card-section'
		});
		let $deckGroup = $('<div>', {
			id: 'deck-meta',
			class: 'card-group'
		});
		$deckSection.append($deckGroup);
		$('#content').append($deckSection);

		$deckGroup.droppable({
			accept: Object.keys(this.meta).map(type => '.' + type + '-card').join(', '),
			drop: function(event, ui) {
				let $card = ui.draggable;
				let cardId = $card.data('card').oracle_id;

				for (let metaType in MTG.meta) {
					if ($card.hasClass(metaType + '-card')) {
						const index = MTG.getZoneCardIndex($card);
						MTG.meta[metaType].splice(index, 1);

						MTG.refreshDeckMeta();
						MTG.refreshMeta();
					}
				}
			}
		});
	};

	MTG.createMeta = function() {
		for (let metaType in this.meta) {
			let $metaTypeSection = $('<div>', {
				class: 'card-section'
			});
			let $metaTypeGroup = $('<div>', {
				id: metaType + '-meta',
				class: 'card-group'
			});
			$metaTypeSection.append($metaTypeGroup);
			$('#content').append($metaTypeSection);

			$metaTypeGroup.droppable({
				accept: this.getMetaAccept(metaType),
				drop: function(event, ui) {
					let $card = ui.draggable;
					let cardId = $card.data('card').oracle_id;
					$card.remove();

					MTG.removeMetaType(cardId);
					MTG.addMetaType(cardId, metaType);

					MTG.refreshDeckMeta();
					MTG.refreshMeta();
				}
			});

			$metaTypeGroup.sortable({
				stop: function(event, ui) {
					MTG.meta[metaType] = MTG.getZoneCardIds($metaTypeGroup);
					$metaTypeGroup.children().each(function(index) {
						$(this).data('zoneIndex', index);
					});
				}
			});
		}
	};



	MTG.createLibraryBrowser = function() {
		let $libraryCards = $('<div>', {
			id: 'library-cards'
		});
		$('#library-dialog').append($libraryCards);

		this.bindZoneSorting($libraryCards, 'libraryIds', this.refreshLibrary);

		let $libraryList = $('<div>', {
			id: 'library-list'
		});
		$('#library-dialog').append($libraryList);

		let $ul = $('<ul>');
		$libraryList.append($ul);
	};

	MTG.createSortablePlayZone = function(zone, acceptedCards) {
		const $zone = $('<div>', { id: zone });
		const idsKey = sortablePlayZones.get(zone);
		$('#content').append($zone);

		$zone.droppable({
			accept: acceptedCards,
			drop: (event, ui) => {
				const $card = ui.draggable;
				this[idsKey].push($card.data('card').oracle_id);
				this.removeFromSortablePlayZone($card);
				$card.remove();
				this.refreshSortableZone(zone);
			}
		});

		this.bindZoneSorting($zone, idsKey, () => this.refreshSortableZone(zone));
	};

	MTG.bindZoneSorting = function($zone, zoneIdsKey, refresh) {
		$zone.sortable({
			stop: () => {
				this[zoneIdsKey] = this.getZoneCardIds($zone);
				refresh.call(this);
			}
		});
	};

	MTG.getZoneCardIds = function($zone) {
		const cardIds = [];
		$zone.children().each(function() {
			cardIds.push($(this).data('card').oracle_id);
		});
		return cardIds;
	};

	MTG.getZoneCardIndex = function($card) {
		return $card.data('zoneIndex');
	};

	MTG.createLibrary = function() {
		let $library = $('<div>', {
			id: 'library'
		});

		this.addCounter($library, false, 40, 'library-top-counter');
		this.addCounter($library, false);

		$('#content').append($library);
	};

	MTG.getBattlefieldSlotId = function(row, column) {
		return row + '_' + column;
	};

	MTG.createBattlefield = function() {
		let $battlefield = $('<div>', {
			id: 'battlefield'
		});

		$('#content').append($battlefield);

		for (let i = 0; i < this.rowCount; i++) {
			for (let j = 0; j < this.columnCount; j++) {
				let $slot = $('<div>', {
					id: this.getBattlefieldSlotId(i, j),
					class: 'slot'
				});

				$battlefield.append($slot);
			}
		}

		this.addManaCounters();
		this.addTreasureCounter();

		$battlefield.find('.slot').droppable({
			tolerance: 'pointer',
			accept: function($card) {
				return $card.is('.card:not(.library-card)') && $(this).children('.card').length === 0;
			},
			drop: function(event, ui) {
				let $card = ui.draggable;

				if (!$card.hasClass('battlefield-card')) {
					let cardId = $card.data('card').oracle_id;

					MTG.removeFromSortablePlayZone($card);

					if ($card.hasClass('token-card')) {
						MTG.refreshTokenBox();
					}

					if ($card.hasClass('command-zone-card')) {
						MTG.refreshCommandZone();
					}

					$card.remove();

					$card = MTG.createBattlefieldCard(cardId);
				}

				$card.css({
					top: 0,
					left: 0
				});

				$(event.target).append($card);
			}
		});

	};

	MTG.removeCardFromPlay = function($card) {
		this.removeFromSortablePlayZone($card);
		$card.remove();
		this.refreshTokenBox();
		this.refreshCommandZone();
	};

	MTG.removeFromSortablePlayZone = function($card) {
		const zone = $card.data('playZone');
		if (!sortablePlayZones.has(zone)) {
			return;
		}
		this[sortablePlayZones.get(zone)].splice(this.getZoneCardIndex($card), 1);
		this.refreshSortableZone(zone);
	};

	MTG.createBattlefieldCard = function(cardId) {
		const $card = this.createCard(this.getCard(cardId), 'battlefield-' + cardId);
		$card.addClass('battlefield-card');
		$card.draggable({ revert: 'invalid' });
		this.addCardControl($card, 'counter-toggle');
		this.addCardControl($card, 'tap-toggle');
		this.addCounter($card, true);
		return $card;
	};



	MTG.getOracleData = function() {
		return this.cardData.slice();
	};

	MTG.getDeckData = function() {
		const deck = this.commandZoneIds.concat(this.deckIds).map(id => this.getCard(id));
		return deck.concat(this.getBasicLandCopies(id => this.getCard(id)));
	};

	MTG.getBasicLandCopies = function(resolve = id => id) {
		const copies = [];
		for (const { id, count } of this.basicLands) {
			const entry = resolve(id);
			for (let i = 0; i < count; i++) {
				copies.push(entry);
			}
		}
		return copies;
	};

	MTG.getTokenData = function() {
		const sortKey = card => card.name.toLowerCase() + '-' + card.oracle_id;
		return this.cardData.filter(card => this.tokenIds.includes(card.oracle_id)).sort((a, b) => {
			const keyA = sortKey(a);
			const keyB = sortKey(b);
			return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
		});
	};

	MTG.getCommandZoneOptions = function() {
		const commandZoneOptions = this.cardData.map(function(card) {
			return {
				id: card.oracle_id,
				text: card.name,
			};
		});

		commandZoneOptions.sort(function(a, b) {
			if (a.text > b.text) {
				return 1;
			}

			if (a.text < b.text) {
				return -1;
			}

			return 0;
		});

		return commandZoneOptions;
	};

	MTG.getCardTreeType = function(card) {
		const frontTypeLine = this.getFrontTypeLine(card);
		if (frontTypeLine === null) {
		   return null;
		}

		const faces = card.layout === 'modal_dfc' ? card.type_line.split('//') : [frontTypeLine];
		for (const face of faces) {
		   const types = face.split('\u2014')[0];
		   if (/\bLand\b/.test(types)) {
			  return /\bBasic\b/.test(types) ? 'BasicLand' : 'Land';
		   }
		}

		return this.getCardType(card);
	};

	MTG.getCardTreeCmc = function(card, cardType = this.getCardTreeType(card)) {
		if (cardType === 'Land' || cardType === 'BasicLand') {
			return '0';
		}
		return card.hasOwnProperty('cmc') ? String(parseInt(card.cmc)) : null;
	};

	MTG.getCardTreeData = function(cardData) {
		let cardTreeData = {};
		for (let i = 0; i < cardData.length; i++) {
			let card = cardData[i];

			const cardType = this.getCardTreeType(card);
			const cardCmc = this.getCardTreeCmc(card, cardType);

			if (cardType !== null && cardCmc !== null) {
				if (!cardTreeData.hasOwnProperty(cardType)) {
					cardTreeData[cardType] = {};
				}

				if (!cardTreeData[cardType].hasOwnProperty(cardCmc)) {
					cardTreeData[cardType][cardCmc] = [];
				}

				cardTreeData[cardType][cardCmc].push(card);
			}
		}

		for (let cardType in cardTreeData) {
			let cardTypeData = cardTreeData[cardType];

			for (let cardCmc in cardTypeData) {
				let cardCmcData = cardTypeData[cardCmc];

				cardCmcData.sort(function(a, b) {
					if (a.name.toLowerCase() < b.name.toLowerCase()) {
						return -1;
					}
					if (a.name.toLowerCase() > b.name.toLowerCase()) {
						return 1;
					}

					return 0;
				});
			}
		}

		return cardTreeData;
	};



	MTG.getDefaultCardSide = function(card) {
		if (card.layout === 'modal_dfc') {
			const types = card.type_line.split('//').map(face => face.split('\u2014')[0]);
			if (!/\bLand\b/.test(types[0]) && /\bLand\b/.test(types[1])) {
				return 'back';
			}
		}
		return 'front';
	};

	MTG.createCard = function(card, id) {
		const side = this.getDefaultCardSide(card);
		let $card = $('<div>', {
			id: id,
			class: 'card',
			css: {
				backgroundImage: 'url(' + this.getSmallImage(card, side) + ')'
			},
			data: {
				card: card,
				side: side
			},
			attr: {
				oracle_id: card.oracle_id
			}
		});

		return $card;
	};

	MTG.addCardControl = function($card, buttonClass) {
		$card.append($('<button>', { class: buttonClass }));
	};

	MTG.addCounter = function($card, hidden, initialCount = 0, counterClass = '') {
		const counter = new Counter(initialCount, counterClass);
		$card.append(counter.$element);

		if (hidden) {
			counter.$element.hide();
		}
	};

	MTG.addManaCounters = function() {
		let $manaCounters = [];
		for (const { id, name, count } of this.basicLands) {
			if (name === 'wastes' || count > 0) {
				$manaCounters.push(this.createManaCounter(id, name));
			}
		}

		if ($manaCounters.length <= this.rowCount) {
			for (let i = 0; i < $manaCounters.length; i++) {
				let $slot = $('#' + this.getBattlefieldSlotId(i, this.columnCount - 1));
				let $manaCounter = $manaCounters[i];
				$slot.append($manaCounter);
				$slot.removeClass('slot');
			}
		}
	};

	MTG.createManaCounter = function(landId, landType) {
		let manaCounter = this.getCard(landId);
		let $manaCounter = this.createCard(manaCounter, landType);
		$manaCounter.removeClass('card').addClass('mana-counter');
		this.addCounter($manaCounter, false);

		return $manaCounter;
	};

	MTG.addTreasureCounter = function() {
		const $treasure = $('<div>', {
			class: 'treasure-counter',
			'aria-label': 'Treasure'
		});
		this.addCounter($treasure, false);
		const $slot = $('#' + this.getBattlefieldSlotId(0, this.columnCount - 2));
		$slot.append($treasure).removeClass('slot');
	};

	MTG.refreshDeckMeta = function() {
		const $deckMeta = $('#deck-meta');
		const $section = $deckMeta.parent('.card-section');
		$section.hide();
		$('.deck-card').remove();

		for (let cardId of this.deckIds) {
			if (!this.hasMetaType(cardId)) {
				let card = this.getCard(cardId);
				let $card = this.createCard(card, 'deck-' + cardId);

				$card.addClass('deck-card');
				$card.draggable({
					revert: 'invalid',
					connectToSortable: '#deck-meta'
				});

				$section.show();
				$deckMeta.append($card);
			}
		}
	};

	MTG.refreshMeta = function() {
		for (let metaType in this.meta) {
			$('.' + metaType + '-card').remove();
			const containerSelector = '#' + metaType + '-meta';
			const $container = $(containerSelector);

			for (let i = 0; i < this.meta[metaType].length; i++) {
				let cardId = this.meta[metaType][i];
				let card = this.getCard(cardId);
				let $card = this.createCard(card, metaType + '-' + i);

				$card.addClass(metaType + '-card').data('zoneIndex', i);
				$card.draggable({
					revert: 'invalid',
					connectToSortable: containerSelector
				});

				$container.append($card);
			}
		}
	};



	MTG.resetPlaySession = function() {
		this.resetPlayState();
		this.clearPlayBoard();
		this.refreshTokenBox();
		this.refreshCommandZone();
		this.shuffle();
		this.drawCards(7);
		this.refreshLibrary();
		this.refreshHand();
	};

	MTG.getStartingLibraryIds = function() {
		return this.deckIds.concat(this.getBasicLandCopies())
			.filter(id => !this.commandZoneIds.includes(id));
	};

	MTG.resetPlayState = function() {
		this.libraryIds = this.getStartingLibraryIds();
		this.handIds = [];
		this.graveyardIds = [];
		this.turn = 1;
	};

	MTG.clearPlayBoard = function() {
		$('#library-cards').empty();
		$('#library-list ul').empty();
		$('#hand').empty();
		$('#graveyard').empty();
		$('#token-box').empty();
		$('#command-zone').empty();
		$('.counter').each(function() {
			$(this).data('counter').reset();
		});
		$('#battlefield .slot').empty();
		this.updateTurnLabel();
	};

	MTG.updateTurnLabel = function() {
		$('#turn').text('Turn: ' + this.turn);
	};

	MTG.shuffle = function() {
		for (let i = this.libraryIds.length - 1; i > 0; i--) {
			let j = Math.floor(Math.random() * (i + 1));
			[this.libraryIds[i], this.libraryIds[j]] = [this.libraryIds[j], this.libraryIds[i]];
		}
	};

	MTG.drawCards = function(count) {
		this.handIds = this.handIds.concat(this.libraryIds.splice(0, count));
	};

	MTG.drawAndRefresh = function(count) {
		this.drawCards(count);
		this.refreshLibrary();
		this.refreshHand();
	};

	MTG.discard = function() {
		this.graveyardIds = this.graveyardIds.concat(this.handIds);
		this.handIds = [];
	};

	MTG.graveyardToLibrary = function() {
		this.libraryIds = this.libraryIds.concat(this.graveyardIds);
		this.graveyardIds = [];
	};

	MTG.putIntoHand = function(cardId) {
		this.handIds.push(cardId);
		this.libraryIds.splice(this.libraryIds.indexOf(cardId), 1);
	};

	MTG.refreshLibrary = function() {
		$('.library-card').remove();
		const $libraryCards = $('#library-cards');
		const $libraryList = $('#library-list');
		const $list = $libraryList.find('ul').empty();

		const libraryCards = [];
		for (let i = 0; i < this.libraryIds.length; i++) {
			let cardId = this.libraryIds[i];
			let card = this.getCard(cardId);
			let $card = this.createCard(card, 'library-' + i);

			$card.addClass('library-card');

			$libraryCards.append($card);

			libraryCards.push(card);
		}

		libraryCards.sort((a, b) => {
			const nameA = a.name.toLowerCase();
			const nameB = b.name.toLowerCase();
			return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
		});

		for (const card of libraryCards) {
			let $li = $('<li>', {
				class: 'list-card',
				text: card.name.split(' // ').shift(),
				attr: {
					oracle_id: card.oracle_id
				}
			});

			$list.append($li);
		}

		$libraryList.css('height', Math.ceil(this.libraryIds.length / (this.columnCount - this.libraryListColumnCount)) * this.cardHeight);
	};

	MTG.refreshHand = function() {
		this.refreshSortableZone('hand');
	};

	MTG.refreshGraveyard = function() {
		this.refreshSortableZone('graveyard');
	};

	MTG.refreshSortableZone = function(zone) {
		const cardIds = this[sortablePlayZones.get(zone)];
		const cardClass = zone + '-card';
		const zoneSelector = '#' + zone;
		$('.' + cardClass).remove();
		const $zone = $(zoneSelector);

		for (let i = 0; i < cardIds.length; i++) {
			let card = this.getCard(cardIds[i]);
			let $card = this.createCard(card, zone + '-' + i);

			$card.addClass(cardClass).data({ playZone: zone, zoneIndex: i });
			$card.draggable({
				revert: 'invalid',
				connectToSortable: zoneSelector
			});

			$zone.append($card);
		}
	};

	MTG.refreshTokenBox = function() {
		this.refreshDraggableZone('#token-box', 'token-card', 'token-', this.getTokenData());
	};

	MTG.refreshCommandZone = function() {
		const cards = this.commandZoneIds.map(id => this.getCard(id));
		this.refreshDraggableZone('#command-zone', 'command-zone-card', 'command-zone-card-', cards);
	};

	MTG.refreshDraggableZone = function(zoneSelector, cardClass, idPrefix, cards) {
		$('.' + cardClass).remove();
		const $zone = $(zoneSelector);

		for (const card of cards) {
			const $card = this.createCard(card, idPrefix + card.oracle_id);
			$card.addClass(cardClass);
			$card.draggable({
				revert: 'invalid'
			});

			$zone.append($card);
		}
	};



	MTG.setDeckCount = function() {
		const deckCount = this.commandZoneIds.length +
			this.basicLands.reduce((total, { count }) => total + count, this.deckIds.length);

		$('#deck').text('Deck ' + deckCount);
	};

	MTG.getDeckCopyCounts = function() {
		let cardCounts = {};

		for (let i = 0; i < this.deckIds.length; i++) {
			let deckId = this.deckIds[i];

			cardCounts[deckId] = cardCounts.hasOwnProperty(deckId) ? cardCounts[deckId] + 1 : 1;
		}

		for (const { id, count } of this.basicLands) {
			if (count > 0) {
				cardCounts[id] = count;
			}
		}

		return cardCounts;
	};

	MTG.setCardCounts = function() {
		$('#content .card > .card-copy-count').remove();
		for (const [deckId, cardCount] of Object.entries(this.getDeckCopyCounts())) {
			$('#card-' + deckId).append($('<p>', {
				class: 'card-copy-count',
				text: cardCount
			}));
		}
	};

	MTG.moveToDeck = function(id, cardType) {
		if (cardType === 'BasicLand') {
			const land = this.basicLands.find(land => land.id === id);
			if (land) {
				land.count++;
			}
		} else if (cardType === 'Token') {
			if (this.tokenIds.indexOf(id) === -1) {
				this.tokenIds.push(id);
			}
		} else {
			this.deckIds.push(id);
		}

		this.setDeckCount();

		this.resetPreviewImage();
	};

	MTG.removeFromDeck = function(id, cardType) {
		if (cardType === 'BasicLand') {
			const land = this.basicLands.find(land => land.id === id);
			if (land) {
				land.count--;
			}
		} else if (cardType === 'Token') {
			const index = this.tokenIds.indexOf(id);
			if (index !== -1) {
				this.tokenIds.splice(index, 1);
			}
		} else {
			const index = this.deckIds.indexOf(id);
			if (index !== -1) {
				this.deckIds.splice(index, 1);
			}
		}

		this.setDeckCount();

		this.resetPreviewImage();
	};



	MTG.getMetaType = function(card, cardType = this.getCardType(card)) {
		for (const type of ['strategy', 'ramp', 'advantage', 'interaction']) {
			if (this.meta[type].indexOf(card.oracle_id) > -1) {
				return type;
			}
		}

		if (cardType === 'Land') {
			return 'land';
		}

		return 'none';
	};

	MTG.hasMetaType = function(cardId) {
		return ['strategy', 'ramp', 'advantage', 'interaction', 'land']
			.some(type => this.meta[type].indexOf(cardId) > -1);
	};

	MTG.addMetaType = function(cardId, metaType) {
		this.meta[metaType].push(cardId);
	};

	MTG.removeMetaType = function(cardId) {
		for (let metaType in this.meta) {
			const cards = this.meta[metaType];
			const index = cards.indexOf(cardId);
			if (index !== -1) {
				cards.splice(index, 1);
			}
		}
	};

	MTG.getMetaAccept = function(metaType) {
		let classes = [
			'.deck-card'
		];
		for (let type in MTG.meta) {
			if (type !== metaType) {
				classes.push('.' + type + '-card');
			}
		}

		return classes.join(', ');
	};




	MTG.findCardData = function(cardId) {
		return this.cardData.find(card => card.oracle_id === cardId);
	};

	MTG.getCard = function(cardId) {
		const card = this.findCardData(cardId);
		return card ? JSON.parse(JSON.stringify(card)) : undefined;
	};

	MTG.getFrontTypeLine = function(card) {
		return card.hasOwnProperty('type_line') ? card.type_line.split('//')[0] : null;
	};

	MTG.getCardType = function(card) {
		const cardTypeLine = this.getFrontTypeLine(card);
		if (cardTypeLine === null) {
			return null;
		}
		for (const [type, ...terms] of cardTypeRules) {
			if (terms.every(term => cardTypeLine.includes(term))) {
				return type;
			}
		}
		return null;
	};

	MTG.getCardName = function(cardId) {
		return this.findCardData(cardId).name;
	};

	MTG.isLegendary = function(card) {
		const cardTypeLine = this.getFrontTypeLine(card);
		return cardTypeLine !== null && cardTypeLine.indexOf('Legendary') > -1;
	};

	MTG.getSmallImage = function(card, side) {
		return card.images[side].small;
	};

	MTG.getNormalImage = function(card, side) {
		return card.images[side].normal;
	};

	MTG.showCardPreview = function(card, side) {
		const $preview = $('#preview');
		$preview.css({
			backgroundImage: 'url(' + this.getNormalImage(card, side) + ')'
		});
		$preview.toggleClass('commander', !card.commander);
		$preview.toggleClass('oathbreaker', !card.oathbreaker);
	};

	MTG.resetPreview = function() {
		$('#preview').removeClass('commander oathbreaker');
		this.resetPreviewImage();
	};

	MTG.resetPreviewImage = function() {
		$('#preview').css({
			backgroundImage: 'url("assets/back.jpeg")'
		});
	};

	$(document).ready(function() {
		MTG.setupDialogs();
		MTG.setupOracleSearch();
		MTG.setupUI();
		MTG.init();
	});
})(jQuery);
