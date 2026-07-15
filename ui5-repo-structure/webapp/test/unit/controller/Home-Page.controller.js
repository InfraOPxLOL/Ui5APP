/*global QUnit*/

sap.ui.define([
	"ui5repostructure/controller/Home-Page.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Home-Page Controller");

	QUnit.test("I should test the Home-Page controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
