define([
    'dojo/_base/declare',
    'dijit/_WidgetBase',
    'dijit/_TemplatedMixin',
    'dijit/_WidgetsInTemplateMixin',
    'dojo/dom-style',
    'dojo/parser',
    'dijit/form/NumberTextBox',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/_base/Color',
    'dojo/store/Memory',
    'dojo/dom-construct',
    'dojo/dom',
    'dgrid/OnDemandGrid',
    'dgrid/Selection',
    'dgrid/Keyboard',
    'esri/toolbars/draw',
    'esri/layers/GraphicsLayer',
    'esri/graphic',
    'esri/graphicsUtils',
    'esri/renderers/SimpleRenderer',
    'esri/tasks/BufferParameters',
    'dojo/text!./FindHoles/templates/FindHoles.html',
    'esri/renderers/UniqueValueRenderer',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/symbols/SimpleLineSymbol',
    'esri/symbols/SimpleFillSymbol',
    'esri/layers/FeatureLayer',
    'esri/tasks/query',
    'dojo/topic',
    'dojo/aspect',
    'dojo/number',
    'dijit/form/Button',
    'xstyle/css!./FindHoles/css/FindHoles.css'
], function (declare,
             _WidgetBase,
             _TemplatedMixin,
             _WidgetsInTemplateMixin,
             domStyle,
             parser,
             NumberTextBox,
             lang,
             array,
             Color,
             Memory,
             domConstruct,
             dom,
             OnDemandGrid,
             Selection,
             Keyboard,
             Draw,
             GraphicsLayer,
             Graphic,
             graphicsUtils,
             SimpleRenderer,
             BufferParameters,
             drawTemplate,
             UniqueValueRenderer,
             SimpleMarkerSymbol,
             SimpleLineSymbol,
             SimpleFillSymbol,
             FeatureLayer,
             Query,
             topic,
             aspect,
             number) {

    // main find holes dijit
    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        widgetsInTemplate: true,
        templateString: drawTemplate,
        drawToolbar: null,
        graphics: null,
        mapClickMode: null,
        spatialReference: null,
        postCreate: function () {
            this.inherited(arguments);

            if (this.spatialReference === null) {
                this.spatialReference = this.map.spatialReference.wkid;
            }

            this.drawToolbar = new Draw(this.map);
            this.drawToolbar.on('draw-end', lang.hitch(this, 'onDrawToolbarDrawEnd'));

            this.createGraphicLayers();
            this.createSearchPolygonLayer();

            this.own(topic.subscribe('mapClickMode/currentSet', lang.hitch(this, 'setMapClickMode')));
            if (this.parentWidget && this.parentWidget.toggleable) {
                this.own(aspect.after(this.parentWidget, 'toggle', lang.hitch(this, function () {
                    this.onLayoutChange(this.parentWidget.open);
                })));
            }
            dom.byId('newSearchButtonDiv').style.display = 'none';
            var widget = this;
            this.newDistanceNode = dom.byId('newDistanceTextBox');
            this.newDistanceNode.oninput = function () {
                var distance = number.parse(this.value);
                var disabled = distance == null || isNaN(distance) || distance < 0;
                dom.byId('newSearchButtonDiv').style.display = disabled ? 'none' : 'inline-block';
                /*domStyle.set(dom.byId('newSearchButtonDiv'), {
                 'visibility': (disabled ? 'hidden' : 'visible')
                 //'disabled': disabled
                 });*/
            }

            this.newSearchButtonNode = dom.byId('newSearchButton');
            this.newSearchButtonNode.onclick = function () {
                if (widget.searchGraphic) {
                    var distanceTextBox = widget.newDistanceNode;
                    var distance = number.parse(distanceTextBox.value);
                    widget.searchWithBufferDistance(widget.searchGraphic, distance);
                };
            };
            //this.viewModel = kendo.observable(/*{
            /*distance: null,
             canSearch: function () {
             return this.distance != null && !isNaN(this.distance);
             }
             }*/
            //);
            //kendo.bind($('#bottomResultsContent'), this.viewModel);
        },
        createSearchPolygonLayer: function () {
            this.searchPolygonGraphics = new FeatureLayer({
                layerDefinition: {
                    geometryType: 'esriGeometryPolygon',
                    fields: [{
                        name: 'OBJECTID',
                        type: 'esriFieldTypeOID',
                        alias: 'OBJECTID',
                        domain: null,
                        editable: false,
                        nullable: false
                    }, {
                        name: 'ren',
                        type: 'esriFieldTypeInteger',
                        alias: 'ren',
                        domain: null,
                        editable: true,
                        nullable: false
                    }]
                },
                featureSet: null
            }, {
                id: 'searchGraphics_poly',
                title: 'Search Graphics',
                mode: FeatureLayer.MODE_SNAPSHOT
            });
            //this.searchPolygonRenderer = new SimpleRenderer(this.polygonSymbol);
            this.searchPolygonRenderer = new UniqueValueRenderer(new SimpleFillSymbol(), 'ren', null, null, ', ');
            this.searchPolygonRenderer.addValue({
                value: 1,
                symbol: new SimpleFillSymbol({
                    color: [
                        255,
                        170,
                        0,
                        255
                    ],
                    outline: {
                        color: [
                            255,
                            170,
                            0,
                            255
                        ],
                        width: 1,
                        type: 'esriSLS',
                        style: 'esriSLSSolid'
                    },
                    type: 'esriSFS',
                    style: 'esriSFSForwardDiagonal'
                }),
                label: 'polygons for holes search',
                description: 'polygons for holes search'
            });
            this.searchPolygonGraphics.setRenderer(this.searchPolygonRenderer);
            this.map.addLayer(this.searchPolygonGraphics);
        },
        createGraphicLayers: function () {
            this.pointSymbol = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_CIRCLE, 10, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 0, 0]), 1), new Color([255, 0, 0, 1.0]));
            //this.polylineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_DASH, new Color([255, 0, 0]), 1);
            this.polygonSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, new SimpleLineSymbol(SimpleLineSymbol.STYLE_DASHDOT, new Color([255, 0, 0]), 2), new Color([255, 255, 0, 0.0]));

            this.pointGraphics = new GraphicsLayer({
                id: 'findholes_point',
                title: 'Поиск скважин'
            });
            this.pointRenderer = new SimpleRenderer(this.pointSymbol);
            this.pointRenderer.label = 'User drawn points';
            this.pointRenderer.description = 'User drawn points';
            this.pointGraphics.setRenderer(this.pointRenderer);
            this.map.addLayer(this.pointGraphics);

            /*this.polylineGraphics = new GraphicsLayer({
                id: 'drawGraphics_line',
                title: 'Draw Graphics'
            });
            this.polylineRenderer = new SimpleRenderer(this.polylineSymbol);
            this.polylineRenderer.label = 'User drawn lines';
            this.polylineRenderer.description = 'User drawn lines';
            this.polylineGraphics.setRenderer(this.polylineRenderer);
            this.map.addLayer(this.polylineGraphics);*/

            this.polygonGraphics = new FeatureLayer({
                layerDefinition: {
                    geometryType: 'esriGeometryPolygon',
                    fields: [{
                        name: 'OBJECTID',
                        type: 'esriFieldTypeOID',
                        alias: 'OBJECTID',
                        domain: null,
                        editable: false,
                        nullable: false
                    }, {
                        name: 'ren',
                        type: 'esriFieldTypeInteger',
                        alias: 'ren',
                        domain: null,
                        editable: true,
                        nullable: false
                    }]
                },
                featureSet: null
            }, {
                id: 'findholes_poly',
                title: 'Find Holes Graphics',
                mode: FeatureLayer.MODE_SNAPSHOT
            });
            //this.polygonRenderer = new SimpleRenderer(this.polygonSymbol);
            this.polygonRenderer = new UniqueValueRenderer(new SimpleFillSymbol(), 'ren', null, null, ', ');
            this.polygonRenderer.addValue({
                value: 1,
                symbol: new SimpleFillSymbol({
                    color: [
                        255,
                        170,
                        0,
                        255
                    ],
                    outline: {
                        color: [
                            255,
                            170,
                            0,
                            255
                        ],
                        width: 1,
                        type: 'esriSLS',
                        style: 'esriSLSSolid'
                    },
                    type: 'esriSFS',
                    style: 'esriSFSForwardDiagonal'
                }),
                label: 'find holes in polygon',
                description: 'поиск скважн'
            });
            //this.polygonRenderer.label = 'User drawn polygons';
            //this.polygonRenderer.description = 'User drawn polygons';
            this.polygonGraphics.setRenderer(this.polygonRenderer);
            this.map.addLayer(this.polygonGraphics);
        },
        drawPoint: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.POINT);
        },
        /*drawCircle: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.CIRCLE);
        },
        drawLine: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.POLYLINE);
        },
        drawFreehandLine: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.FREEHAND_POLYLINE);
        },*/
        drawPolygon: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.POLYGON);
        },
        drawFreehandPolygon: function () {
            this.disconnectMapClick();
            this.drawToolbar.activate(Draw.FREEHAND_POLYGON);
        },
        disconnectMapClick: function () {
            topic.publish('mapClickMode/setCurrent', 'draw');
            // dojo.disconnect(this.mapClickEventHandle);
            // this.mapClickEventHandle = null;
        },
        connectMapClick: function () {
            topic.publish('mapClickMode/setDefault');
            // if (this.mapClickEventHandle === null) {
            //     this.mapClickEventHandle = dojo.connect(this.map, 'onClick', this.mapClickEventListener);
            // }
        },
        onDrawToolbarDrawEnd: function (evt) {
            this.drawToolbar.deactivate();
            this.connectMapClick();
            var graphic;
            switch (evt.geometry.type) {
                case 'point':
                    graphic = new Graphic(evt.geometry);
                    this.pointGraphics.add(graphic);
                    break;
                /*case 'polyline':
                    graphic = new Graphic(evt.geometry);
                    this.polylineGraphics.add(graphic);
                    break;*/
                case 'polygon':
                    graphic = new Graphic(evt.geometry, null, {
                        ren: 1
                    });
                    //this.polygonGraphics.add(graphic);
                    var distanceTextBox = dom.byId('distanceTextBox');
                    var distance = number.parse(distanceTextBox.value);
                    this.searchWithBufferDistance(graphic, distance);
                    this.searchGraphic = graphic;
                    if (!isNaN(distance) && distance > 0) {
                        this.newDistanceNode.value = distance.toString();
                        dom.byId('newSearchButtonDiv').style.display = 'inline';
                    }
                    else
                        this.newDistanceNode.value = null;
                    break;
                default:
            }
        },
        searchWithBufferDistance: function (graphic, distance) {
            // если дистанция не задана, поиск производится внутри нарисованного полигона
            if (isNaN(distance) || distance <= 0) {
                this.search(graphic);
                this.searchPolygonGraphics.add(graphic);
            }
            // дистанция задана - к полигону добавляется буфер
            else {
                if (!this.gsvc)
                    this.gsvc = new esri.tasks.GeometryService("http://qwerty-3:6080/arcgis/rest/services/Utilities/Geometry/GeometryServer");
                var buffer = new esri.tasks.BufferParameters();
                buffer.geometries = [graphic.geometry];
                buffer.distances = [distance];
                buffer.unit = esri.tasks.GeometryService.UNIT_METER;
                buffer.outSpatialReference = this.map.spatialReference;
                buffer.geodesic = true;
                var widget = this;
                this.gsvc.buffer(buffer, function (b) {
                    var gr = widget.bufferGeometry(b);
                    widget.search(gr);
                    widget.polygonGraphics.add(gr);
                    widget.searchPolygonGraphics.add(graphic);
                });
            }
            //this.search(graphic);
        },
        clearGraphics: function () {
            this.searchGraphic = null;
            this.endDrawing();
            this.connectMapClick();
            this.clearResultsGrid();
            var buttonContainerNode = dom.byId('collapseButton_bottom');
            var collapseButtonNode = buttonContainerNode.firstChild;
            if (collapseButtonNode.className.indexOf('close') > -1)
                collapseButtonNode.click();
        },
        endDrawing: function () {
            this.pointGraphics.clear();
            //this.polylineGraphics.clear();
            this.polygonGraphics.clear();
            this.searchPolygonGraphics.clear();
            this.drawToolbar.deactivate();
        },
        onLayoutChange: function (open) {
            // end drawing on close of title pane
            if (!open) {
                this.endDrawing();
                if (this.mapClickMode === 'draw') {
                    topic.publish('mapClickMode/setDefault');
                }
            }
        },
        setMapClickMode: function (mode) {
            this.mapClickMode = mode;
        },
        // Построение геометрии по буферу
        bufferGeometry: function (buf) {
            var attribs = { 'type': 'Geodesic' };
            return graphic = new Graphic(buf[0], null, attribs);
        },
        // Поиск точек, входящих в заданный полигон
        search: function (graphic) {
            /*var query = this.queries[this.queryIdx];
             var searchText = this.searchTextDijit.get('value');
             if (!query || !searchText || searchText.length === 0) {
             return;
             }
             if (query.minChars && (searchText.length < query.minChars)) {
             this.findResultsNode.innerHTML = 'You must enter at least ' + query.minChars + ' characters.';
             this.findResultsNode.style.display = 'block';
             return;
             }*/

            /*this.createResultsGrid();
             this.clearResultsGrid();*/
            this.clearFeatures();
            domConstruct.empty(this.findResultsNode);

            /*if (!query || !query.url || !query.layerIds || !query.searchFields) {
             return;
             }*/

            var layers = this.map.getLayersVisibleAtScale(this.map.getScale());
            var widget = this;
            var query = new Query();
            query.outFields = ['*'];
            query.geometry = graphic.geometry;
            var url = 'http://qwerty-3:6080/arcgis/rest/services/Test/Wells_MS/MapServer/0';
            var holesLayer = new FeatureLayer(url)
            holesLayer.queryFeatures(query, function (response) {
                var results = response.features;
                var resultsNode = dom.byId('resultsBottom');
                var countNode = dom.byId('findResultsCount');
                var gridNode = dom.byId('findResultsGrid');
                var buttonContainerNode = dom.byId('collapseButton_bottom');
                var collapseButtonNode = buttonContainerNode.firstChild;
                domStyle.set(resultsNode, {
                    'visibility': 'visible'
                });
                if (results.length > 0) {
                    countNode.innerHTML = 'Найдено ' + results.length + ' скважин';
                    /*var dataSource = new kendo.data.DataSource.create();
                     array.forEach(results, function (hole) {
                     dataSource.add({
                     holename: hole.attributes['DHHOLENAME'],
                     coordinates: widget.coordFormatter(hole.geometry)
                     });
                     })*/
                    var dataSource = new kendo.data.DataSource({
                        data: results,
                        schema: {
                            /*model: {
                             fields: {
                             holename: function () {
                             return this.attributes['DHHOLENAME'];
                             },
                             coordinates: function () {
                             return widget.coordFormatter(this.geometry);
                             }
                             }
                             }*/
                            parse: function (response) {
                                var holes = [];
                                for (var i = 0; i < response.length; i++) {
                                    var hole = {
                                        holename: response[i].attributes['DHHOLENAME'],
                                        coordinates: widget.coordFormatter(response[i].geometry)
                                    };
                                    holes.push(hole);
                                }
                                return holes;
                            }
                        }
                    });
                    var grid = $('#findResultsGrid').kendoGrid({
                        columns: [{
                            title: 'Наименование',
                            field: 'holename'
                        }, {
                            title: 'Координаты',
                            field: 'coordinates'
                        }],
                        dataSource: dataSource,
                        height: 300
                    });
                    widget.highlightFeatures(results);
                    /*domStyle.set(resultsNode, {
                     'height': '322px'
                     });*/
                }
                else {
                    countNode.innerHTML = 'Скважины в заданном многоугольнике не найдены';
                    gridNode.innerHTML = null;
                    /*domStyle.set(resultsNode, {
                     'height': '22px'
                     });*/
                }
                if (collapseButtonNode.className.indexOf('close') > -1)
                    collapseButtonNode.click();
                collapseButtonNode.click();
                /*if (results.length > 0) {
                 widget.findResultsNode.innerHTML = 'Найдено ' + results.length + ' скважин';
                 widget.findResultsNode.style.display = 'block';
                 widget.results = response.features;
                 widget.highlightFeatures();
                 widget.showResultsGrid();
                 }
                 else {
                 widget.findResultsNode.innerHTML = 'Скважины в заданном многоугольнике не найдены';
                 widget.findResultsNode.style.display = 'block';
                 }*/
            });
        },

        coordFormatter: function (coord) {
            var format = {
                places: 3,
                pattern: '#,##0.000'
            };
            var x = number.format(coord.x, format);
            var y = number.format(coord.y, format);
            return x + ' : ' + y;
        },

        createResultsGrid: function () {
            if (!this.resultsStore) {
                this.resultsStore = new Memory({
                    idProperty: 'id',
                    data: []
                });
            }

            if (!this.resultsGrid) {
                var Grid = declare([OnDemandGrid, Keyboard, Selection]);
                this.resultsGrid = new Grid({
                    selectionMode: 'single',
                    cellNavigation: false,
                    showHeader: true,
                    store: this.resultsStore,
                    columns: {
                        'Скважина': {
                            get: function (item) {
                                return item.attributes['DHHOLENAME'];
                            }
                        },
                        'Координаты': {
                            name: 'Координаты',
                            //field: 'geometry',
                            //formatter: this.coordFormatter
                            get: function (item) {
                                var format = {
                                    places: 3,
                                    pattern: '#,##0.000'
                                };
                                var x = number.format(item.geometry.x, format);
                                var y = number.format(item.geometry.y, format);
                                return x + ' : ' + y;
                            }
                        }
                        /*layerName: 'Layer',
                         foundFieldName: 'Field',
                         value: 'Result'*/
                    },
                    sort: [{
                        attribute: 'value',
                        descending: false
                    }]
                    //minRowsPerPage: 250,
                    //maxRowsPerPage: 500
                }, this.findResultsGrid);

                this.resultsGrid.startup();
                this.resultsGrid.on('dgrid-select', lang.hitch(this, 'selectFeature'));
            }
        },

        clearResultsGrid: function () {
            /*if (this.resultStore) {
             this.resultsStore.setData([]);
             }
             if (this.resultsGrid) {
             this.resultsGrid.refresh();
             }
             this.findResultsNode.style.display = 'none';
             this.findResultsGrid.style.display = 'none';*/
            var resultsNode = dom.byId('resultsBottom');
            var countNode = dom.byId('findResultsCount');
            var gridNode = dom.byId('findResultsGrid');
            countNode.innerHTML = null;
            gridNode.innerHTML = null;
            domStyle.set(resultsNode, {
                'visibility': 'hidden'
            });
        },


        clearFeatures: function () {
            this.pointGraphics.clear();
            //this.polylineGraphics.clear();
            this.polygonGraphics.clear();
            this.searchPolygonGraphics.clear();
        },

        highlightFeatures: function (results) {
            var unique = 0;
            array.forEach(results, function (result) {
                // add a unique key for the store
                result.id = unique;
                unique++;
                var graphic, feature = result; //.feature;
                switch (feature.geometry.type) {
                    case 'point':
                        // only add points to the map that have an X/Y
                        if (feature.geometry.x && feature.geometry.y) {
                            graphic = new Graphic(feature.geometry);
                            this.pointGraphics.add(graphic);
                        }
                        break;
                    /*case 'polyline':
                        // only add polylines to the map that have paths
                        if (feature.geometry.paths && feature.geometry.paths.length > 0) {
                            graphic = new Graphic(feature.geometry);
                            this.polylineGraphics.add(graphic);
                        }
                        break;*/
                    case 'polygon':
                        // only add polygons to the map that have rings
                        if (feature.geometry.rings && feature.geometry.rings.length > 0) {
                            graphic = new Graphic(feature.geometry, null, {
                                ren: 1
                            });
                            this.polygonGraphics.add(graphic);
                        }
                        break;
                    default:
                }
            }, this);

            // zoom to layer extent
            var zoomExtent = null;
            //If the layer is a single point then extents are null
            // if there are no features in the layer then extents are null
            // the result of union() to null extents is null

            if (this.pointGraphics.graphics.length > 0) {
                zoomExtent = this.getPointFeaturesExtent(this.pointGraphics.graphics);
            }
            /*if (this.polylineGraphics.graphics.length > 0) {
                if (zoomExtent === null) {
                    zoomExtent = graphicsUtils.graphicsExtent(this.polylineGraphics.graphics);
                } else {
                    zoomExtent = zoomExtent.union(graphicsUtils.graphicsExtent(this.polylineGraphics.graphics));
                }
            }*/
            if (this.polygonGraphics.graphics.length > 0) {
                if (zoomExtent === null) {
                    zoomExtent = graphicsUtils.graphicsExtent(this.polygonGraphics.graphics);
                } else {
                    zoomExtent = zoomExtent.union(graphicsUtils.graphicsExtent(this.polygonGraphics.graphics));
                }
            }

            if (zoomExtent) {
                this.zoomToExtent(zoomExtent);
            }
        },

        showResultsGrid: function () {
            this.resultsGrid.store.setData(this.results);
            this.resultsGrid.refresh();

            var lyrDisplay = 'block';
            this.resultsGrid.styleColumn('layerName', 'display:' + lyrDisplay);

            this.findResultsGrid.style.display = 'block';
        },

        selectFeature: function (event) {
            var result = event.rows;

            // zoom to feature
            if (result.length) {
                var data = result[0].data;
                if (data) {
                    var feature = data.feature;
                    if (feature) {
                        var extent = feature.geometry.getExtent();
                        if (!extent && feature.geometry.type === 'point') {
                            extent = this.getExtentFromPoint(feature);
                        }
                        if (extent) {
                            this.zoomToExtent(extent);
                        }
                    }
                }
            }
        },

        getPointFeaturesExtent: function (pointFeatures) {
            var extent = graphicsUtils.graphicsExtent(pointFeatures);
            if (extent === null && pointFeatures.length > 0) {
                extent = this.getExtentFromPoint(pointFeatures[0]);
            }

            return extent;
        },

        getExtentFromPoint: function (point) {
            var sz = this.pointExtentSize; // hack
            var pt = point.geometry;
            var extent = new Extent({
                'xmin': pt.x - sz,
                'ymin': pt.y - sz,
                'xmax': pt.x + sz,
                'ymax': pt.y + sz,
                'spatialReference': {
                    wkid: this.spatialReference
                }
            });
            return extent;
        },

        zoomToExtent: function (extent) {
            this.map.setExtent(extent.expand(1.2));
        }

    });
});