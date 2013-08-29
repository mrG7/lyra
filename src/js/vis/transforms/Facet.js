vde.Vis.transforms.Facet = (function() {
  var facet = function(pipelineName) {
    vde.Vis.Transform.call(this, pipelineName, 'facet', ['keys', 'sort']);

    // Because facets perform structural transformations, fork
    // whatever pipeline this is assigned to.
    this.forkPipeline = true;

    // When the facet transform is applied to marks, hook into
    // the spec generation and inject a new group that inherits
    // the pipeline, and rearrange scales, axes, marks.
    this._group = {
      type: "group",
      scales: [],
      axes: [],
      marks: [],
      properties: {}
    };

    this._seen = {scales: {}, axes: {}, marks: {}};

    vde.Vis.callback.register('mark.post_spec',  this, this.markPostSpec);
    vde.Vis.callback.register('group.post_spec', this, this.groupPostSpec);

    return this;
  };

  facet.prototype = new vde.Vis.Transform();
  var prototype = facet.prototype;

  prototype.destroy = function() {
    vde.Vis.callback.deregister('mark.post_spec',  this);
    vde.Vis.callback.deregister('group.post_spec', this);

    if(this.pipeline()) {
      this.pipeline().forkName = null;
      this.pipeline().forkIdx  = null;
    }
  };

  prototype.spec = function() {
    var spec = {type: 'facet'};
    if(this.properties.keys) spec.keys = [this.properties.keys.spec()];

    return spec;
  };

  prototype.markPostSpec = function(opts) {
    if(!this.pipeline() || !this.pipeline().forkName) return;
    if(!this.properties.keys) return;
    if(opts.item.type == 'group')  return;
    if(!opts.item.pipeline() ||
      (opts.item.pipeline() && opts.item.pipeline().name != this.pipeline().name)) return;
    if(this._seen.marks[opts.item.name]) return;

    var spec = vg.duplicate(opts.spec);
    delete spec.from.data;   // Inherit from the group
    if(opts.item.oncePerFork) {
      spec.from.transform || (spec.from.transform = [])
      spec.from.transform.push({
        type: 'filter',
        test: 'index == 0'
      });
    }

    this._group.marks.push(spec);
    this._seen.marks[opts.item.name] = 1;

    // Clear the spec because we'll inject it in later
    delete opts.spec.name;
    delete opts.spec.properties;
  };

  prototype.groupPostSpec = function(opts) {
    var self = this,
        emptyInjection = this._group.scales.length == 0 &&
          this._group.axes.length == 0 && this._group.marks.length == 0;

    if(!this.pipeline() || !this.pipeline().forkName) return;
    if(!this.properties.keys) return;
    if(emptyInjection && opts.item.pipeline() != this.pipeline()) return;

    var layout = (this.properties.layout && this.properties.layout != 'Overlap');

    // Add a scale to position the facets
    if(layout) {
      var isHoriz = this.properties.layout == 'Horizontal';
      if(!this._posScale) {
        this._posScale = this.pipeline().scale({
          type: 'ordinal',
          padding: 0.2,
          field: this.properties.keys
        }, {}, 'facets');
      }

      this._posScale.properties.range = new vde.Vis.Field(isHoriz ? 'width' : 'height');
      this._posScale.properties.points = false;
    }

    if(emptyInjection) {  // Facet was applied on the group directly

    } else {              // Facet was applied on marks, so inject a group
      this._group.name = opts.item.name + '_facet';
      this._group.from = {data: this.pipeline().forkName};

      if(layout) {
        opts.spec.scales || (opts.spec.scales = []);
        opts.spec.scales.forEach(function(scale) {
          if(scale.name == self._posScale.name) return;

          // Shadow this scale if it uses group width/height and we're laying out _groups
          if((self.properties.layout == 'Horizontal' && scale.range == 'width') ||
             (self.properties.layout == 'Vertical' && scale.range == 'height'))
                self._group.scales.push(vg.duplicate(scale));
        });

        opts.spec.scales.push(this._posScale.spec());

        var pos =  {scale: this._posScale.name, field: 'key'};
        var size = {scale: this._posScale.name, band: true};

        this._group.properties.enter = isHoriz ?
          {x: pos, width: size} : {y: pos, height: size};
      }

      opts.spec.marks.push(vg.duplicate(this._group));
    }

    // Clear it for the next pass
    this._group.properties = {};
    this._group.scales = [];
    this._group.axes = [];
    this._group.marks = [];
    this._seen = {scales: {}, axes: {}, marks: {}};
  };

  return facet;
})();
