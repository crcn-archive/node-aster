var __ = fs = require('fs'),
path = require('path'),        
uglify = require('uglify-js'),
parser = uglify.parser,
sys = require('sys');  
                  


 
 function noexpr()
 {
 	return {};
 } 

 function copyTo(from, to)
 {
 	for(var i in from) to[i] = from[i];
 }

exports.copyTo = copyTo;
      
var Expressions = {     
	
	'call': function(ast, walker)
	{                        
		var v = ast[1].walker;

		
		//could be func
		return { name: v ? v.name : null , reference: v, params: ast[2] };
		
	},  
	
	//var assignment
	'var': function(ast, walker)
	{                   
		var vars = ast[1],
			values = [];


     	vars.forEach(function(vr, i)
     	{
     	
			var vr   =  vars[i],     
				val  = { name: vr[0] };        
				
			if(vr[1]) 
			{
				val.value = vr[1].walker;

				val.value.assignedTo = val;

				val.references = function()
				{
					return walker.symbolTable().references(val.name) || [];
				}


				val.replaceName = function(newName)
				{
					val.name = vr[0] = newName;
				}
			}  

		   
		 	values.push(val);     

		 	// if(val.name == 'sk')
		 	// console.log(val.value)
			                                              
			walker.symbolTable().set(val.name, val.value, true);
		});          
		
		return { values: values };  
	},  
	
	//dot.syntax.to.obj
	'dot': function(ast, walker)
	{                       
		var property = ast[1].walker,  
		chain = [],
		ref; 
		                  
		if(property.type == 'name')
		{   
			ref = property.reference;
			chain.push(property.name);
		}                                     
		else
		if(property.type == 'dot')
		{                                                                
			ref = property.reference;
			chain = property.chain;
		}
		else
		{
			// console.log('Cannot handle reference chain for %s', property.type);
		}   
		
		chain = chain.concat(walker.rightMost().target);                                                       
		
		return { reference: ref, name: chain[0], chain: chain };
	},
	                          
	//reference to a variable
	'name': function(ast, walker)
	{                                
		//return the name, along with the reference in the AST
		return { name: ast[1], 
				reference: walker.symbolTable().get(ast[1], walker),
				replaceName: function(value) 
				{
					ast[1] = value;
				}};
	},

	'regexp': function(ast)
	{
		return { value: ast[1], flags: ast[2] };
	},

	'string': function(ast)
	{
		return { value: ast[1] };	
	},

	'num': function(ast)
	{
		return { value: ast[1] };
	},


	'block': function(ast, walker)
	{
		return {};
	},

	'defun': function(ast, walker)
	{
		var symbolTable = walker.symbolTable();
		var expr = Expressions['function'](ast, walker);
		symbolTable.set(expr.name, walker, true);

		walker.references = function()
		{
			return symbolTable.references(expr.name) || [];
		}

		return expr;
	},


	'function': function(ast, walker)
	{
		walker.subifySymbolTable();
		return { name: ast[1], params: ast[2], body: ast[3] };	
	},

	/**
	 * assignments are for items which already exist
	 */
	'assign': function(ast, walker)
	{
		return { name: ast[2], value: ast[3], reference: walker.symbolTable().get(ast[2].walker.name, walker) };	
	},

	'reg': noexpr,
	'stat': noexpr,
	'if': noexpr,
	'toplevel': noexpr,
	'unary-prefix': noexpr,
	'binary': noexpr,
	'sub': noexpr,
	'try': noexpr,
	'return': noexpr,
	'for-in': noexpr

}

   
function leftMost(current, parent)
{
	for(var i = 0, n = current.length; i < n; i++)
	{                                            
		//left most must be a string with no children
		if(current[i] instanceof Array) return leftMost(current[i], aster(current));
	}               

	return aster(current, parent);
}   

function rightMost(current, parent)
{
	for(var i = current.length; i--;)
	{                                                                  
		if(typeof current[i] == 'string') return aster(current[i], parent);
		
		var ret = rightMost(current[i], aster(current));
		
		if(ret) return ret;
	}                      
	
	return null;
}         
           
/**
 * contains assignments throughout the AST. 
 */

var getSymbolTable = function(parent)
{                     
	var table = {},
		references = {},
		children = [];
	var ret = {     
		
		symbols: function()
		{
			var values = table,
				ch = [];
			
			for(var i = children.length; i--;)
			{
				ch.push(children[i].symbols());
			}	

			return { values: values, children: ch };
		},

		parent: parent,

		children: children,
		         
		/**
		 * returns value of name given
		 */
		
		get: function(name, referenceTo)
		{                                                
			var v = table[name];
			    
			
			if(referenceTo)
			{
				//ref to toString perhaps? 
				if(typeof references[name] != 'object') references[name] = [];

				references[name].push(referenceTo);
			}

			return v;
			

			//search local var first, then bubble up.
			return v || (parent ? parent.get(name, referenceTo) : null);
		},  

		/**
		 * returns all references to object
		 */

		references: function(name)
		{
			return references[name] || (parent ? parent.references(name) : null)
		},
		
		
		/**
		 * owner of the given variable
		 */
		
		owner: function(name)
		{
			return table[name] ? this : (parent ? parent.owner(name) : this);
		},
		                                                                     
		/**
		 * sets a value locally, or globally
		 */
		
		set: function(name, value, toOwner)
		{
			if(toOwner) return this.owner(name).set(name, value);
			table[name] = value;
		}
	};


	if(parent) parent.children.push(ret);

	return ret;
}

var aster = function(ast, parent, symbolTable)
{      
	if(ast.walker) return ast.walker;     
	
	var children = [];

		
	var walker = {  
		target: ast,    
		parent: parent,  
		root: function()
		{
			var cp = this;

			while(cp.parent) cp = cp.parent;

			return cp;
		},
		parentExpr: function()
		{
			var cp = this.parent;

			if(!cp) return null;

			while(cp && !cp.type) cp = cp.parent;
			return cp;	
		},
		symbolTable: function(value)
		{
			if(value) symbolTable = value;

			// return symbolTable || 
			return symbolTable || (parent ? parent.symbolTable() : walker.symbolTable(getSymbolTable(null, ast)));
		},  
		subifySymbolTable: function()
		{
		 	walker.symbolTable(getSymbolTable(walker.symbolTable()));	
		}, 
		leftMost: function()
		{         
			return leftMost(ast);
		},  
		rightMost: function()
		{                             
			return rightMost(ast);
		},    
		index: function()
		{
			return parent.target.indexOf(ast);
		},      
		length: function()
		{
			return ast.length;
		},
		replaceWith: function(ast)
		{
			parent.target.splice(walker.index(),1,ast);
		},
		nextSibling: function()
		{ 
			var i = walker.index();
			if(i == -1 || i == parent.target.length - 1) return null;  
			
			return aster(parent.target[i+1], parent);
		},   
		
		/**
		 * sibling from the parent
		 */
		                  
		prevSibling: function()
		{
			var i = walker.index();
			if(i == -1 || i == 0) return null;          
			
			return aster(parent.target[i-1], parent);
		},          
		
		/**
		 * removes the ast
		 */
		
		remove: function()
		{
			var i = walker.index();
			if(i == -1) return null;   
			                             
			parent.target.splice(i, 1);        
			
			walker.parent = parent = undefined;
		},        
		
		/**
		 * replaces with difference sauce code
		 */

		replaceWith: function(newAst)
		{
			ast = newAst;
			ast.walker = walker;

			parent.target.splice(walker.index(), 1, ast);
		},       
		
		/**
		 * prepares the ast for evaluation
		 */
		
		_prepare: function()
		{                              
			for(var i = 0, n = ast.length; i < n; i++)
			{                  
				var v = ast[i];
				
				if(v instanceof Array)
				{
					aster(v, walker)._prepare();
				}  
			}
		}, 
		
		/**
		 * walks the aster tree
		 */
		
	    walk: function(handlers)
		{               
			for(var i = 0, n = ast.length; i < n; i++)
			{
				var v = ast[i],
					ret;
				
				if(v instanceof Array)
				{
					if((ret = v.walker.walk(handlers)) != undefined) return ret;
				}  
				else
				if(handlers[v] && v != '__proto__')
				{
					if((ret = handlers[v](walker)) != undefined) return ret;
				}


				//item removed? 
				if(n != ast.length)
				{
					i -= (n - ast.length);
					n = ast.length;
				}
			} 
		},
		
		/**
		 * writes the expression as a JS string
		 */
		
		toString: function()
		{             
			try
			{       
				return uglify.uglify.gen_code(ast, { beautify: true });
			}
			catch(e)
			{
				console.log(e.stack);
				return '';
			}
		}
	}            
	
	walker._prepare();
	
	if((ast instanceof Array) && typeof ast[0] == 'string')
	{                     
		var expr = Expressions[ast[0]];

		walker.type = ast[0];
		
		if(!expr)
		{
			//console.warn('Expression %s does not exist', ast[0]);     
		}
		else
		{     
			copyTo(expr(ast, walker), walker);
		}                    
	}
	           
	return ast.walker = walker;
}
                                                                                                                      


exports.parse = function(source, symbolTable)
{   
	//it's completely legal for node.js apps to have # at the beginning, but uglify HATES it.

	var ast = parser.parse(source.replace(/^#[^\n\r]+/,''), false, false);

	return aster(ast, null, symbolTable);
}            

exports.load = function(filePath, symbolTable)
{
	return exports.parse(fs.readFileSync(filePath, 'utf8'), symbolTable);
}


